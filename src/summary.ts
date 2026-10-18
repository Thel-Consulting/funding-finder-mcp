import type { Cache } from "./sources/http.js";
import { NIH_DOCS_URL, NIH_SEARCH_URL, SBIR_STTR_ACTIVITY_CODES, searchNihRaw, type RawNihProject } from "./sources/nih.js";
import { NSF_DOCS_URL, NSF_MAX_RPP, NSF_SBIR_STTR_PROGRAMS, searchNsf } from "./sources/nsf.js";

export const NIH_PAGE = 500;
export const NIH_MAX_PAGES = 4;
// NSF: page through everything when it fits in NSF_FULL_PAGES, otherwise sample
// each fiscal year within NSF_MAX_PAGES. TIME_BUDGET_MS stops either earlier.
export const NSF_FULL_PAGES = 24;
export const NSF_MAX_PAGES = 40;
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

// Per-year rows with a status. When the fetch was partial, a year whose fetched
// count is below NIH's own count is a sample ("partial"), and a year with no
// fetched records is "not aggregated" (null, not 0).
export function nihYearRows(rows: { key: string; count: number; amount: number }[], counts: Map<number, number>, partial: boolean) {
  if (!partial) return rows.map((r) => ({ ...r, status: "complete" as YearStatus, upstreamCount: r.count }));
  const keys = new Set([...rows.map((r) => r.key), ...[...counts.keys()].map(String)]);
  return [...keys].sort().map((key) => {
    const r = rows.find((x) => x.key === key) ?? { key, count: 0, amount: 0 };
    const up = counts.get(Number(key)) ?? null;
    const status: YearStatus = up !== null && r.count >= up ? "complete" : r.count > 0 ? "partial" : "not aggregated";
    return status === "not aggregated" ? { key, count: null, amount: null, status, upstreamCount: up } : { ...r, status, upstreamCount: up };
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
      ? `Partial: aggregated ${rows.length} of ${upstreamTotal} records (stopped by ${stoppedBy ?? "page cap"}). Years with status "partial" are a sample, so their count and amount are lower bounds; upstreamCount is NIH's exact count per year. Totals and breakdowns cover only the aggregated records. Narrow the year range or add a state for complete totals.`
      : undefined,
    ...agg,
    byFiscalYear: nihYearRows(agg.byFiscalYear, yearCounts, partial),
  };
}

export function fiscalYearOf(isoDate: string | null) {
  if (!isoDate) return null;
  const [y, m] = isoDate.split("-").map(Number);
  return m >= 10 ? y + 1 : y;
}

export type YearStatus = "complete" | "partial" | "not aggregated";

export interface NsfYearRow {
  key: string;
  status: YearStatus;
  count: number | null;
  amount: number | null;
  excluded: number | null;
  fetched: number;
  upstreamCount: number | null;
}

interface NsfYear {
  fy: number;
  total: number | null;
  fetched: number;
  count: number;
  amount: number;
  excluded: number;
}

// Page 1 of every year, then page 2 of every year, and so on, so each year gets
// its newest awards before any year gets more. Page 0 is fetched separately.
export function planYearPages(years: { fy: number; pagesNeeded: number }[], budget: number) {
  const plan: { fy: number; page: number }[] = [];
  const maxPages = Math.max(0, ...years.map((y) => y.pagesNeeded));
  for (let page = 1; page < maxPages && plan.length < budget; page++) {
    for (const y of years) if (page < y.pagesNeeded && plan.length < budget) plan.push({ fy: y.fy, page });
  }
  return plan;
}

export function nsfYearRow(y: NsfYear, complete?: boolean): NsfYearRow {
  const status: YearStatus =
    complete ?? (y.total !== null && y.fetched >= y.total) ? "complete" : y.fetched > 0 ? "partial" : "not aggregated";
  const counted = status !== "not aggregated";
  return {
    key: String(y.fy),
    status,
    count: counted ? y.count : null,
    amount: counted ? Math.round(y.amount) : null,
    excluded: counted ? y.excluded : null,
    fetched: y.fetched,
    upstreamCount: y.total ?? (status === "complete" ? y.count + y.excluded : null),
  };
}

export async function summarizeNsf(p: SummaryInput, cache?: Cache) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const byState = new Map<string, Bucket>();
  const byProgram = new Map<string, Bucket>();
  const byOrg = new Map<string, Bucket>();
  const excludedByProgram = new Map<string, Bucket>();
  const fiscalYears = Array.from({ length: p.to - p.from + 1 }, (_, i) => p.to - i);
  const years = new Map<number, NsfYear>(fiscalYears.map((fy) => [fy, { fy, total: null, fetched: 0, count: 0, amount: 0, excluded: 0 }]));
  let failedPages = 0;
  let stoppedByTime = false;
  const base = { keyword: p.keyword, state: p.state, sbirSttrOnly: true, rpp: NSF_MAX_RPP };
  const yearRange = (from: number, to: number) => ({ awardDateFrom: `${from - 1}-10-01`, awardDateTo: `${to}-09-30` });

  type Page = Awaited<ReturnType<typeof searchNsf>>;
  const take = (r: Page) => {
    for (const a of r.awards) {
      const y = years.get(fiscalYearOf(a.awardDate) ?? 0);
      if (!y) continue;
      const amt = a.fundsObligated ?? 0;
      y.count++;
      y.amount += amt;
      add(byProgram, a.program ?? "unknown", amt);
      add(byOrg, a.organization ?? "unknown", amt);
      if (!p.state) add(byState, a.state ?? "unknown", amt);
    }
    for (const a of r.excluded) {
      const y = years.get(fiscalYearOf(a.awardDate) ?? 0);
      if (y) y.excluded++;
      add(excludedByProgram, a.program ?? "unknown", a.fundsObligated ?? 0);
    }
  };
  // Runs page requests NSF_CONCURRENCY at a time until done or out of time.
  const runPages = async (jobs: { params: Record<string, unknown>; onPage: (r: Page) => void }[]) => {
    for (let i = 0; i < jobs.length; i += NSF_CONCURRENCY) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        stoppedByTime = true;
        return;
      }
      const batch = jobs.slice(i, i + NSF_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((j) => searchNsf({ ...base, ...j.params, timeoutMs: remaining - 500, fallback: false }, cache)));
      results.forEach((r, k) => {
        if (r.status === "fulfilled") batch[k].onPage(r.value);
        else failedPages++;
      });
    }
  };

  const first = await searchNsf({ ...base, ...yearRange(p.from, p.to), offset: 0, timeoutMs: TIME_BUDGET_MS - 1000 }, cache);
  const upstreamTotal = first.total;
  const pagesNeeded = Math.ceil(upstreamTotal / NSF_MAX_RPP);
  const sampled = pagesNeeded > NSF_FULL_PAGES;
  let rows: NsfYearRow[];

  if (!sampled) {
    // Small enough to fetch everything.
    take(first);
    let fetched = first.pageSize;
    await runPages(
      Array.from({ length: Math.max(0, pagesNeeded - 1) }, (_, i) => ({
        params: { ...yearRange(p.from, p.to), offset: (i + 1) * NSF_MAX_RPP },
        onPage: (r: Page) => {
          take(r);
          fetched += r.pageSize;
        },
      })),
    );
    const complete = fetched >= upstreamTotal;
    rows = [...years.values()].map((y) => {
      if (complete) return nsfYearRow({ ...y, total: y.count + y.excluded, fetched: y.count + y.excluded }, true);
      return nsfYearRow({ ...y, fetched: y.count + y.excluded }, false);
    });
  } else {
    // Too many awards to fetch in time: sample each fiscal year, newest awards first.
    await runPages(
      fiscalYears.map((fy) => ({
        params: { ...yearRange(fy, fy), offset: 0 },
        onPage: (r: Page) => {
          const y = years.get(fy)!;
          y.total = r.total;
          y.fetched += r.pageSize;
          take(r);
        },
      })),
    );
    const plan = planYearPages(
      [...years.values()].filter((y) => y.total !== null).map((y) => ({ fy: y.fy, pagesNeeded: Math.ceil(y.total! / NSF_MAX_RPP) })),
      NSF_MAX_PAGES - fiscalYears.length,
    );
    await runPages(
      plan.map(({ fy, page }) => ({
        params: { ...yearRange(fy, fy), offset: page * NSF_MAX_RPP },
        onPage: (r: Page) => {
          years.get(fy)!.fetched += r.pageSize;
          take(r);
        },
      })),
    );
    rows = [...years.values()].map((y) => nsfYearRow(y));
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  const counted = rows.filter((r) => r.status !== "not aggregated");
  const total = counted.reduce((s, r) => s + (r.amount ?? 0), 0);
  const aggregated = counted.reduce((s, r) => s + (r.count ?? 0), 0);
  const excluded = counted.reduce((s, r) => s + (r.excluded ?? 0), 0);
  const incomplete = rows.filter((r) => r.status !== "complete");
  const partial = incomplete.length > 0;
  const reasons = [
    sampled ? `${upstreamTotal} awards is more than ${NSF_FULL_PAGES * NSF_MAX_RPP}, so each fiscal year was sampled newest first (${NSF_MAX_PAGES} page budget)` : null,
    stoppedByTime ? "time budget reached" : null,
    failedPages ? `${failedPages} page requests failed or timed out` : null,
  ].filter(Boolean);
  return {
    agency: "NSF",
    source: { name: "NSF Award Search API", queryUrl: first.queryUrl, docs: NSF_DOCS_URL },
    filters: {
      fundProgramName: "SBIR OR STTR",
      companyAwardPrograms: [...NSF_SBIR_STTR_PROGRAMS],
      state: p.state ?? null,
      fiscalYears: `${p.from}-${p.to}`,
      keyword: p.keyword ?? null,
    },
    notes:
      "Counts only SBIR/STTR Phase I, Phase II and Fast-Track company awards (a phase program component plus, from FY1997, a title naming the phase). NSF's fundProgramName search also returns outreach, operations, research center, I-Corps and fellowship awards that mention or were co-funded by SBIR/STTR; those are excluded and reported under excludedNonCompany. " +
      "Fiscal year is derived from the NSF award date (October starts the next fiscal year). Amounts are total funds obligated to each award to date.",
    upstreamTotal,
    recordsAggregated: aggregated,
    partial,
    partialNote: partial
      ? `Partial (${reasons.join("; ") || "incomplete fetch"}). Years with status "partial" count only the awards fetched for that year, so their count and amount are lower bounds; years with status "not aggregated" were not fetched and show null. upstreamCount is NSF's exact count per year before excluding non-company awards. Totals and breakdowns cover only fetched awards. Narrow the year range or add a state for complete totals.`
      : undefined,
    totalAmount: Math.round(total),
    byFiscalYear: rows,
    excludedNonCompany: { count: excluded, byProgram: toObj(excludedByProgram, "amount") },
    byProgram: toObj(byProgram, "amount"),
    byState: p.state ? undefined : toObj(byState, "amount"),
    topOrganizations: toObj(byOrg, "amount", 10),
    incompleteYears: incomplete.map((r) => r.key),
  };
}
