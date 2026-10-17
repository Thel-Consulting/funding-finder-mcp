import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Cache } from "./sources/http.js";
import { UpstreamError } from "./sources/http.js";
import { ELIGIBILITY_CODES, GRANTS_DOCS_URL, GRANTS_SEARCH_URL, searchGrants } from "./sources/grants.js";
import {
  NIH_DOCS_URL,
  NIH_SEARCH_URL,
  SBIR_STTR_ACTIVITY_CODES,
  parseNihProject,
  searchNih,
  searchNihRaw,
  type NihProject,
} from "./sources/nih.js";
import { NSF_DOCS_URL, searchNsf, type NsfAward } from "./sources/nsf.js";
import { extractKeywords, similarity } from "./keywords.js";
import { summarizeNih, summarizeNsf } from "./summary.js";

// Unknown keys are an error, not silently dropped, so a guessed name like
// "state" instead of "org_states" cannot widen a search to the whole country.
function strict<T extends z.ZodRawShape>(shape: T) {
  const valid = Object.keys(shape).join(", ");
  return z.strictObject(shape, {
    error: (iss) =>
      iss.code === "unrecognized_keys" ? `Unknown parameter(s): ${iss.keys.join(", ")}. Valid parameters: ${valid}.` : undefined,
  });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

const stateCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter US state or territory code, like SD")
  .transform((s) => s.toUpperCase());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const year = z.number().int().min(1985).max(2100);

type Json = Record<string, unknown>;

function ok(summary: string, data: Json) {
  return { content: [{ type: "text" as const, text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }] };
}

function fail(err: unknown) {
  const message =
    err instanceof UpstreamError
      ? `${err.message}. The upstream service may be down or slow; try again later.`
      : err instanceof Error
        ? err.message
        : String(err);
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

async function run(tool: string, fn: () => Promise<ReturnType<typeof ok>>) {
  const started = Date.now();
  try {
    const out = await fn();
    console.log(JSON.stringify({ event: "tool", tool, ok: true, ms: Date.now() - started }));
    return out;
  } catch (err) {
    console.log(JSON.stringify({ event: "tool", tool, ok: false, ms: Date.now() - started }));
    return fail(err);
  }
}

function fiscalYears(input: { fiscal_years?: number[]; fiscal_year_from?: number; fiscal_year_to?: number }) {
  if (input.fiscal_years?.length) return input.fiscal_years;
  if (input.fiscal_year_from || input.fiscal_year_to) {
    const from = input.fiscal_year_from ?? 1985;
    const to = input.fiscal_year_to ?? new Date().getUTCFullYear() + 1;
    if (from > to) throw new Error("fiscal_year_from must be less than or equal to fiscal_year_to");
    if (to - from > 40) throw new Error("Fiscal year range is limited to 40 years");
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return undefined;
}

export function registerTools(server: McpServer, cache?: Cache) {
  server.registerTool(
    "search_open_opportunities",
    {
      title: "Search open federal funding opportunities (Grants.gov)",
      description:
        "Read-only. Searches forecasted and posted funding opportunities on Grants.gov (search2 API). " +
        "Use it to find open SBIR/STTR solicitations and other grants. Every result links to its Grants.gov page.",
      inputSchema: strict({
        keyword: z.string().max(200).optional().describe("Free text, for example 'SBIR' or 'wound care'"),
        agency: z
          .string()
          .max(40)
          .optional()
          .describe("Grants.gov agency code, for example HHS-NIH11 (NIH), NSF, DOD, USDA. Pipe-separate several."),
        eligibility: z
          .array(z.enum(Object.keys(ELIGIBILITY_CODES) as [string, ...string[]]))
          .optional()
          .describe(`Grants.gov eligibility codes. 23 = small businesses. Codes: ${Object.entries(ELIGIBILITY_CODES).map(([k, v]) => `${k} ${v}`).join("; ")}`),
        status: z.array(z.enum(["forecasted", "posted"])).optional().describe("Defaults to both forecasted and posted"),
        rows: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
      }),
      annotations: { title: "Search open opportunities", ...READ_ONLY },
    },
    async (input) =>
      run("search_open_opportunities", async () => {
        const res = await searchGrants(input, cache);
        return ok(`Grants.gov returned ${res.total} matching opportunities; showing ${res.opportunities.length}.`, {
          source: { name: "Grants.gov search2 API", endpoint: GRANTS_SEARCH_URL, docs: GRANTS_DOCS_URL },
          total: res.total,
          offset: input.offset,
          results: res.opportunities,
        });
      }),
  );

  server.registerTool(
    "search_nih_awards",
    {
      title: "Search NIH awards (NIH RePORTER)",
      description:
        "Read-only. Searches funded NIH projects in NIH RePORTER v2. Defaults to SBIR/STTR activity codes R43, R44, R41, R42. " +
        "Each row is one project in one fiscal year, so a multi-year project can appear more than once. Every result links to RePORTER.",
      inputSchema: strict({
        text: z.string().max(500).optional().describe("Words to match in title, abstract and terms"),
        text_operator: z.enum(["and", "or"]).default("and"),
        activity_codes: z
          .array(z.string().regex(/^[A-Za-z0-9]{3}$/))
          .optional()
          .describe("NIH activity codes. Omit for R43, R44, R41, R42. Pass [] for all activity codes."),
        org_states: z.array(stateCode).optional().describe("Two-letter state codes of the awardee organization"),
        institutes: z.array(z.string().max(10)).optional().describe("NIH institute or center abbreviations, for example NCI, NIGMS, NIAID"),
        fiscal_years: z.array(year).optional(),
        fiscal_year_from: year.optional(),
        fiscal_year_to: year.optional(),
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).max(14999).default(0),
        include_abstract: z.boolean().default(false),
      }),
      annotations: { title: "Search NIH awards", ...READ_ONLY },
    },
    async (input) =>
      run("search_nih_awards", async () => {
        const params = {
          text: input.text,
          textOperator: input.text_operator,
          activityCodes: input.activity_codes ?? SBIR_STTR_ACTIVITY_CODES,
          orgStates: input.org_states,
          institutes: input.institutes,
          fiscalYears: fiscalYears(input),
          limit: input.limit,
          offset: input.offset,
          includeAbstract: input.include_abstract,
        };
        const res = await searchNih(params, cache);
        const total$ = res.projects.reduce((s, p) => s + (p.awardAmount ?? 0), 0);
        return ok(
          `NIH RePORTER returned ${res.total} matching project-years; showing ${res.projects.length} (award total on this page: $${total$.toLocaleString("en-US")}).`,
          {
            source: { name: "NIH RePORTER API v2", endpoint: NIH_SEARCH_URL, docs: NIH_DOCS_URL },
            filters: { ...params, includeAbstract: undefined },
            total: res.total,
            offset: input.offset,
            results: res.projects,
          },
        );
      }),
  );

  server.registerTool(
    "search_nsf_awards",
    {
      title: "Search NSF awards (NSF Award Search API)",
      description:
        "Read-only. Searches NSF awards through the NSF Award Search API on Research.gov. Defaults to SBIR/STTR awards " +
        "(fundProgramName 'SBIR OR STTR'). Multi-word keywords are ORed by NSF; use AND between words to require all. Every result links to NSF.",
      inputSchema: strict({
        keyword: z.string().max(300).optional().describe("Free text; supports AND, OR, NOT and quoted phrases"),
        state: stateCode.optional().describe("Awardee state, for example SD"),
        award_date_from: isoDate.optional().describe("Earliest award date, YYYY-MM-DD"),
        award_date_to: isoDate.optional().describe("Latest award date, YYYY-MM-DD"),
        sbir_sttr_only: z.boolean().default(true),
        rows: z.number().int().min(1).max(25).default(10),
        offset: z.number().int().min(0).max(2999).default(0),
        include_abstract: z.boolean().default(false),
      }),
      annotations: { title: "Search NSF awards", ...READ_ONLY },
    },
    async (input) =>
      run("search_nsf_awards", async () => {
        const res = await searchNsf(
          {
            keyword: input.keyword,
            state: input.state,
            awardDateFrom: input.award_date_from,
            awardDateTo: input.award_date_to,
            sbirSttrOnly: input.sbir_sttr_only,
            rpp: input.rows,
            offset: input.offset,
            includeAbstract: input.include_abstract,
          },
          cache,
        );
        const total$ = res.awards.reduce((s, a) => s + (a.fundsObligated ?? 0), 0);
        return ok(
          `NSF returned ${res.total} matching awards; showing ${res.awards.length} (obligated on this page: $${total$.toLocaleString("en-US")}).`,
          {
            source: { name: "NSF Award Search API", queryUrl: res.queryUrl, docs: NSF_DOCS_URL },
            total: res.total,
            offset: input.offset,
            results: res.awards,
          },
        );
      }),
  );

  server.registerTool(
    "similar_funded_projects",
    {
      title: "Find similar funded projects (NIH + NSF)",
      description:
        "Read-only. Given a project description or keywords, extracts key terms, searches NIH RePORTER and NSF Award Search, " +
        "and ranks funded projects by term overlap with your description. Scores are a simple keyword overlap, not a semantic judgment.",
      inputSchema: strict({
        description: z.string().min(3).max(4000).describe("Project description or keywords"),
        sources: z.array(z.enum(["nih", "nsf"])).min(1).default(["nih", "nsf"]),
        sbir_sttr_only: z.boolean().default(false).describe("Limit to SBIR/STTR awards"),
        fiscal_year_from: year.optional().describe("NIH fiscal year and NSF award year lower bound"),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: { title: "Similar funded projects", ...READ_ONLY },
    },
    async (input) =>
      run("similar_funded_projects", async () => {
        const keywords = extractKeywords(input.description, 8);
        if (!keywords.length) throw new Error("Could not find any searchable terms in the description");
        const errors: { source: string; error: string }[] = [];
        type Hit = (NihProject | NsfAward) & { score: number; matchedTerms: string[] };
        const hits: Hit[] = [];
        const queries: Json[] = [];

        const nihTask = async () => {
          const fy = input.fiscal_year_from ? fiscalYears({ fiscal_year_from: input.fiscal_year_from }) : undefined;
          const raw = await searchNihRaw(
            {
              text: keywords.join(" "),
              textOperator: "or",
              activityCodes: input.sbir_sttr_only ? SBIR_STTR_ACTIVITY_CODES : undefined,
              fiscalYears: fy,
              limit: 50,
              fields: ["ApplId", "ProjectNum", "CoreProjectNum", "ProjectTitle", "FiscalYear", "AwardAmount", "ActivityCode", "Organization", "AgencyIcAdmin", "ProjectStartDate", "ProjectEndDate", "AbstractText", "Terms"],
            },
            cache,
          );
          queries.push({ source: "NIH RePORTER", endpoint: NIH_SEARCH_URL, text: keywords.join(" "), operator: "or", upstreamTotal: raw.meta.total });
          const seen = new Set<string>();
          for (const r of raw.results) {
            const core = (r as { core_project_num?: string }).core_project_num ?? String(r.appl_id);
            if (seen.has(core)) continue;
            seen.add(core);
            const p = parseNihProject(r);
            const sim = similarity(keywords, p.title, `${r.abstract_text ?? ""} ${(r.terms ?? "").replace(/[<>]/g, " ")}`);
            hits.push({ ...p, score: sim.score, matchedTerms: sim.matched });
          }
        };

        const nsfTask = async () => {
          const attempts = [keywords.slice(0, 3).join(" AND "), keywords.slice(0, 2).join(" AND "), keywords.slice(0, 4).join(" OR ")];
          for (const kw of [...new Set(attempts)]) {
            const res = await searchNsf(
              {
                keyword: kw,
                sbirSttrOnly: input.sbir_sttr_only,
                awardDateFrom: input.fiscal_year_from ? `${input.fiscal_year_from}-01-01` : undefined,
                rpp: 25,
                includeAbstract: true,
                timeoutMs: 4000,
                fallback: false,
              },
              cache,
            );
            queries.push({ source: "NSF Award Search", queryUrl: res.queryUrl, upstreamTotal: res.total });
            if (res.awards.length >= Math.min(5, input.limit) || kw === attempts[attempts.length - 1]) {
              for (const a of res.awards) {
                const sim = similarity(keywords, a.title, a.abstract ?? "");
                const { abstract: _omit, ...rest } = a;
                hits.push({ ...rest, score: sim.score, matchedTerms: sim.matched });
              }
              break;
            }
          }
        };

        const tasks: Promise<void>[] = [];
        if (input.sources.includes("nih")) tasks.push(nihTask().catch((e) => void errors.push({ source: "NIH RePORTER", error: String(e instanceof Error ? e.message : e) })));
        if (input.sources.includes("nsf")) tasks.push(nsfTask().catch((e) => void errors.push({ source: "NSF Award Search", error: String(e instanceof Error ? e.message : e) })));
        await Promise.all(tasks);
        if (!hits.length && errors.length === tasks.length) throw new Error(errors.map((e) => `${e.source}: ${e.error}`).join(" | "));

        hits.sort((a, b) => b.score - a.score);
        const top = hits.slice(0, input.limit);
        return ok(`Found ${hits.length} candidate projects; showing the top ${top.length} by keyword overlap. Terms used: ${keywords.join(", ")}.`, {
          keywords,
          queries,
          errors: errors.length ? errors : undefined,
          results: top,
        });
      }),
  );

  server.registerTool(
    "agency_sbir_summary",
    {
      title: "Summarize SBIR/STTR awards by year and state",
      description:
        "Read-only. Aggregates SBIR/STTR award counts and dollar totals by fiscal year (and by state when no state is given) " +
        "from NIH RePORTER (activity codes R43, R44, R41, R42) or NSF Award Search (fundProgramName SBIR OR STTR). " +
        "Finishes within about 7 seconds: pulls at most 2,000 NIH records or 600 NSF awards and marks the result partial, with a note, when the upstream total is larger.",
      inputSchema: strict({
        agency: z.enum(["NIH", "NSF"]),
        state: stateCode.optional(),
        fiscal_year_from: year.optional().describe("Defaults to five years before the current fiscal year"),
        fiscal_year_to: year.optional().describe("Defaults to the current fiscal year"),
        keyword: z.string().max(200).optional(),
      }),
      annotations: { title: "Agency SBIR summary", ...READ_ONLY },
    },
    async (input) =>
      run("agency_sbir_summary", async () => {
        const now = new Date();
        const currentFy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
        const to = input.fiscal_year_to ?? currentFy;
        const from = input.fiscal_year_from ?? to - 5;
        if (from > to) throw new Error("fiscal_year_from must be less than or equal to fiscal_year_to");
        if (to - from > 25) throw new Error("Summary range is limited to 25 fiscal years");
        const summary =
          input.agency === "NIH"
            ? await summarizeNih({ state: input.state, from, to, keyword: input.keyword }, cache)
            : await summarizeNsf({ state: input.state, from, to, keyword: input.keyword }, cache);
        const s = summary as { recordsAggregated: number; upstreamTotal: number; totalAmount: number; partial: boolean };
        return ok(
          `${input.agency} SBIR/STTR, FY${from} to FY${to}${input.state ? `, ${input.state}` : ""}: ${s.recordsAggregated} records, $${s.totalAmount.toLocaleString("en-US")}${s.partial ? ` (partial: ${s.recordsAggregated} of ${s.upstreamTotal} upstream records)` : ""}.`,
          summary as unknown as Json,
        );
      }),
  );
}
