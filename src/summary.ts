import type { Cache } from "./sources/http.js";
import { NIH_DOCS_URL, NIH_SEARCH_URL, SBIR_STTR_ACTIVITY_CODES, searchNihRaw, type RawNihProject } from "./sources/nih.js";
import { NSF_DOCS_URL, NSF_MAX_RPP, searchNsf } from "./sources/nsf.js";

export const NIH_PAGE = 500;
export const NIH_MAX_PAGES = 4;
export const NSF_MAX_PAGES = 24;
export const NSF_CONCURRENCY = 8;
export const TIME_BUDGET_MS = 6500;

interface Bucket {
  count: number;
  amount: number;
}

export interface SummaryInput {
  state?: string;
  from: number;
  to: number;
  keyword?: string;
}

function add(map: Map<string, Bucket>, key: string, amount: number) {
  const b = map.get(key) ?? { count: 0, amount: 0 };
  b.count++;
  b.amount += amount;
  map.set(key, b);
}

const toObj = (m: Map<string, Bucket>, sort: "key" | "amount" = "key", top?: number) => {
  const entries = [...m.entries()].sort(sort === "key" ? (a, b) => a[0].localeCompare(b[0]) : (a, b) => b[1].amount - a[1].amount);
  return (top ? entries.slice(0, top) : entries).map(([key, v]) => ({ key, count: v.count, amount: Math.round(v.amount) }));
};

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.allSettled(items.slice(i, i + size).map(fn));
}

function withUpstreamCounts(rows: { key: string; count: number; amount: number }[], counts: Map<number, number>) {
  if (!counts.size) return rows;
  const keys = new Set([...rows.map((r) => r.key), ...[...counts.keys()].map(String)]);
  return [...keys].sort().map((key) => {
    const r = rows.find((x) => x.key === key) ?? { key, count: 0, amount: 0 };
    return { ...r, upstreamCount: counts.get(Number(key)) ?? null };
  });
}

export function aggregateNih(rows: RawNihProject[], includeState: boolean) {
  const byYear = new Map<string, Bucket>();
  const byState = new Map<string, Bucket>();
  const byCode = new Map<string, Bucket>();
  const byOrg = new Map<string, Bucket>();
  let total = 0;
  for (const r of rows) {
    const amt = typeof r.award_amount === "number" ? r.award_amount : 0;
    total += amt;
    add(byYear, String(r.fiscal_year ?? "unknown"), amt);
    add(byCode, r.activity_code ?? "unknown", amt);
    add(byOrg, r.organization?.org_name ?? "unknown", amt);
    if (includeState) add(byState, r.organization?.org_state ?? "unknown", amt);
  }
  return {
    totalAmount: Math.round(total),
    byFiscalYear: toObj(byYear),
    byActivityCode: toObj(byCode),
    byState: includeState ? toObj(byState, "amount") : undefined,
    topOrganizations: toObj(byOrg, "amount", 10),
  };
}

export async function summarizeNih(p: SummaryInput, cache?: Cache) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const fiscalYears = Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i);
  const rows: RawNihProject[] = [];
  let upstreamTotal = 0;
  let stoppedBy: string | null = null;
  for (let page = 0; page < NIH_MAX_PAGES; page++) {
    const remaining = deadline - Date.now();
    if (page > 0 && remaining < 1500) {
      stoppedBy = "time budget";
      break;
    }
    const raw = await searchNihRaw(
      {
        activityCodes: SBIR_STTR_ACTIVITY_CODES,
        orgStates: p.state ? [p.state] : undefined,
        fiscalYears,
        text: p.keyword,
        limit: NIH_PAGE,
        offset: page * NIH_PAGE,
        fields: ["ApplId", "FiscalYear", "AwardAmount", "ActivityCode", "Organization"],
        timeoutMs: Math.max(1000, remaining),
      },
      cache,
    );
    upstreamTotal = raw.meta.total;
    rows.push(...raw.results);
    if (raw.results.length < NIH_PAGE || rows.length >= upstreamTotal) break;
    if (page === NIH_MAX_PAGES - 1) stoppedBy = `page cap (${NIH_MAX_PAGES} pages of ${NIH_PAGE})`;
  }
  const partial = rows.length < upstreamTotal;
  const yearCounts = new Map<number, number>();
  if (partial && deadline - Date.now() > 1500) {
    await inBatches(fiscalYears, 6, async (fy) => {
      const raw = await searchNihRaw(
        { activityCodes: SBIR_STTR_ACTIVITY_CODES, orgStates: p.state ? [p.state] : undefined, fiscalYears: [fy], text: p.keyword, limit: 1, fields: ["ApplId"], timeoutMs: Math.max(1000, deadline - Date.now()) },
        cache,
      );
      yearCounts.set(fy, raw.meta.total);
    });
  }
  const agg = aggregateNih(rows, !p.state);
  return {
    agency: "NIH",
    source: { name: "NIH RePORTER API v2", endpoint: NIH_SEARCH_URL, docs: NIH_DOCS_URL },
    filters: { activityCodes: SBIR_STTR_ACTIVITY_CODES, state: p.state ?? null, fiscalYears: `${p.from}-${p.to}`, keyword: p.keyword ?? null },
    notes: "Each NIH record is one project in one fiscal year; amounts are the award_amount for that fiscal year.",
    upstreamTotal,
    recordsAggregated: rows.length,
    partial,
    partialNote: partial
      ? `Partial: aggregated ${rows.length} of ${upstreamTotal} records (stopped by ${stoppedBy ?? "page cap"}). Dollar totals and breakdowns cover only the aggregated records; byFiscalYear[].upstreamCount is the exact NIH count per year. Narrow the year range or add a state for complete totals.`
      : undefined,
    ...agg,
    byFiscalYear: withUpstreamCounts(agg.byFiscalYear, yearCounts),
  };
}

export function fiscalYearOf(isoDate: string | null) {
  if (!isoDate) return null;
  const [y, m] = isoDate.split("-").map(Number);
  return m >= 10 ? y + 1 : y;
}

export async function summarizeNsf(p: SummaryInput, cache?: Cache) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const byYear = new Map<string, Bucket>();
  const byState = new Map<string, Bucket>();
  const byProgram = new Map<string, Bucket>();
  const byOrg = new Map<string, Bucket>();
  let total = 0;
  let aggregated = 0;
  let failedPages = 0;
  const params = {
    keyword: p.keyword,
    state: p.state,
    sbirSttrOnly: true,
    awardDateFrom: `${p.from - 1}-10-01`,
    awardDateTo: `${p.to}-09-30`,
    rpp: NSF_MAX_RPP,
  };
  const take = (awards: Awaited<ReturnType<typeof searchNsf>>["awards"]) => {
    for (const a of awards) {
      const amt = a.fundsObligated ?? 0;
      total += amt;
      aggregated++;
      add(byYear, String(fiscalYearOf(a.awardDate) ?? "unknown"), amt);
      add(byProgram, a.program ?? "unknown", amt);
      add(byOrg, a.organization ?? "unknown", amt);
      if (!p.state) add(byState, a.state ?? "unknown", amt);
    }
  };

  const first = await searchNsf({ ...params, offset: 0, timeoutMs: TIME_BUDGET_MS - 1000 }, cache);
  const upstreamTotal = first.total;
  take(first.awards);
  const pagesNeeded = Math.ceil(upstreamTotal / NSF_MAX_RPP);
  const pages = Array.from({ length: Math.min(pagesNeeded, NSF_MAX_PAGES) - 1 }, (_, i) => i + 1);
  const yearCounts = new Map<number, number>();
  const years = Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i);
  const countsTask =
    pagesNeeded > NSF_MAX_PAGES
      ? inBatches(years, 8, async (fy) => {
          const r = await searchNsf(
            { ...params, awardDateFrom: `${fy - 1}-10-01`, awardDateTo: `${fy}-09-30`, rpp: 1, offset: 0, timeoutMs: Math.max(1000, deadline - Date.now() - 500), fallback: false },
            cache,
          );
          yearCounts.set(fy, r.total);
        })
      : Promise.resolve();
  for (let i = 0; i < pages.length; i += NSF_CONCURRENCY) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const batch = pages.slice(i, i + NSF_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((page) => searchNsf({ ...params, offset: page * NSF_MAX_RPP, timeoutMs: remaining - 500, fallback: false }, cache)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") take(r.value.awards);
      else failedPages++;
    }
  }
  await countsTask;
  const partial = aggregated < upstreamTotal;
  const reasons = [
    pagesNeeded > NSF_MAX_PAGES ? `page cap (${NSF_MAX_PAGES} pages of ${NSF_MAX_RPP})` : null,
    failedPages ? `${failedPages} page requests failed or timed out` : null,
    partial && pagesNeeded <= NSF_MAX_PAGES && !failedPages ? "time budget" : null,
  ].filter(Boolean);
  return {
    agency: "NSF",
    source: { name: "NSF Award Search API", queryUrl: first.queryUrl, docs: NSF_DOCS_URL },
    filters: { fundProgramName: "SBIR OR STTR", state: p.state ?? null, fiscalYears: `${p.from}-${p.to}`, keyword: p.keyword ?? null },
    notes:
      "Fiscal year is derived from the NSF award date (October starts the next fiscal year). Amounts are total funds obligated to each award to date.",
    upstreamTotal,
    recordsAggregated: aggregated,
    partial,
    partialNote: partial
      ? `Partial: aggregated ${aggregated} of ${upstreamTotal} awards, newest first (${reasons.join("; ")}). Dollar totals and breakdowns cover only the aggregated awards; byFiscalYear[].upstreamCount is the exact NSF count per year. Narrow the year range or add a state for complete totals.`
      : undefined,
    totalAmount: Math.round(total),
    byFiscalYear: withUpstreamCounts(toObj(byYear), yearCounts),
    byProgram: toObj(byProgram, "amount"),
    byState: p.state ? undefined : toObj(byState, "amount"),
    topOrganizations: toObj(byOrg, "amount", 10),
  };
}
