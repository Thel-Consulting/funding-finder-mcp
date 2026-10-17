import { fetchJson, UpstreamError, type Cache } from "./http.js";

export const GRANTS_SEARCH_URL = "https://api.grants.gov/v1/api/search2";
export const GRANTS_DOCS_URL = "https://www.grants.gov/api/common/search2";

export const ELIGIBILITY_CODES: Record<string, string> = {
  "00": "State governments",
  "01": "County governments",
  "02": "City or township governments",
  "04": "Special district governments",
  "05": "Independent school districts",
  "06": "Public and State controlled institutions of higher education",
  "07": "Native American tribal governments (Federally recognized)",
  "08": "Public housing authorities/Indian housing authorities",
  "11": "Native American tribal organizations (other than Federally recognized tribal governments)",
  "12": "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education",
  "13": "Nonprofits that do not have a 501(c)(3) status with the IRS, other than institutions of higher education",
  "20": "Private institutions of higher education",
  "21": "Individuals",
  "22": "For profit organizations other than small businesses",
  "23": "Small businesses",
  "25": "Others",
  "99": "Unrestricted",
};

export interface GrantsSearchParams {
  keyword?: string;
  agency?: string;
  eligibility?: string[];
  status?: ("forecasted" | "posted")[];
  rows?: number;
  offset?: number;
}

interface RawHit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  cfdaList?: string[];
}

interface RawResponse {
  errorcode: number;
  msg: string;
  data?: { hitCount: number; oppHits: RawHit[] };
}

export interface Opportunity {
  id: string;
  number: string;
  title: string;
  agency: string;
  agencyCode: string;
  status: string;
  openDate: string | null;
  closeDate: string | null;
  assistanceListings: string[];
  url: string;
}

export function decodeEntities(s: string) {
  return s
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function buildGrantsBody(p: GrantsSearchParams) {
  return {
    keyword: p.keyword ?? "",
    agencies: p.agency ?? "",
    eligibilities: (p.eligibility ?? []).join("|"),
    oppStatuses: (p.status?.length ? p.status : ["forecasted", "posted"]).join("|"),
    rows: p.rows ?? 10,
    startRecordNum: p.offset ?? 0,
  };
}

export function parseGrantsResponse(raw: RawResponse): { total: number; opportunities: Opportunity[] } {
  if (raw.errorcode !== 0 || !raw.data) {
    throw new UpstreamError("Grants.gov", GRANTS_SEARCH_URL, raw.msg || `errorcode ${raw.errorcode}`);
  }
  return {
    total: raw.data.hitCount,
    opportunities: raw.data.oppHits.map((h) => ({
      id: h.id,
      number: h.number,
      title: decodeEntities(h.title),
      agency: h.agency,
      agencyCode: h.agencyCode,
      status: h.oppStatus,
      openDate: h.openDate || null,
      closeDate: h.closeDate || null,
      assistanceListings: h.cfdaList ?? [],
      url: `https://www.grants.gov/search-results-detail/${h.id}`,
    })),
  };
}

export async function searchGrants(p: GrantsSearchParams, cache?: Cache) {
  const raw = await fetchJson<RawResponse>({
    source: "Grants.gov",
    url: GRANTS_SEARCH_URL,
    method: "POST",
    body: buildGrantsBody(p),
    cache,
    ttlSeconds: 1800,
  });
  return parseGrantsResponse(raw);
}

// Client-side filters. Grants.gov search2 has no date or domestic filters, so
// these run on our side and every dropped record is counted by reason.
export interface GrantsFilters {
  openOnly: boolean;
  excludeNoCloseDate: boolean;
  forecastMaxAgeDays: number;
  rollingMaxAgeDays: number;
  postedAfter?: string;
  domesticOnly: boolean;
  today: string;
}

export const DROP_REASONS = [
  "overseas_mission",
  "closed",
  "posted_before_cutoff",
  "no_close_date",
  "stale_forecast",
  "stale_rolling",
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export function denverToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Grants.gov dates are MM/DD/YYYY.
export function isoDate(mdy: string | null) {
  const m = mdy?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function ageDays(iso: string, today: string) {
  return (Date.parse(today) - Date.parse(iso)) / 86_400_000;
}

// State Department overseas posts list as DOS-<country> with an agency name
// like "U.S. Mission to Tunisia", or "U.S. Embassy ..." in the title.
// Washington bureaus (DOS-ECA, DOS-PRM, ...) are not matched.
export function isOverseasMission(o: Pick<Opportunity, "agencyCode" | "agency" | "title">) {
  return /^DOS-/.test(o.agencyCode) && /\b(U\.?S\.? Mission|Mission to|Embassy|Consulate)\b/i.test(`${o.agency} ${o.title}`);
}

export function dropReason(o: Opportunity, f: GrantsFilters): DropReason | null {
  const open = isoDate(o.openDate);
  const close = isoDate(o.closeDate);
  const posted = o.status === "posted";
  if (f.domesticOnly && isOverseasMission(o)) return "overseas_mission";
  if (f.openOnly && posted && close && close < f.today) return "closed";
  if (f.postedAfter && open && open < f.postedAfter) return "posted_before_cutoff";
  if (f.excludeNoCloseDate && posted && !close) return "no_close_date";
  if (f.forecastMaxAgeDays > 0 && o.status === "forecasted" && open && ageDays(open, f.today) > f.forecastMaxAgeDays) return "stale_forecast";
  if (f.rollingMaxAgeDays > 0 && posted && !close && open && ageDays(open, f.today) > f.rollingMaxAgeDays) return "stale_rolling";
  return null;
}

const PAGE_ROWS = 250;
const MAX_PAGES = 4;

// Fetches upstream pages until `rows` records survive the filters, the
// results run out, or MAX_PAGES pages (1000 records) have been scanned.
export async function searchGrantsFiltered(p: GrantsSearchParams, f: GrantsFilters, cache?: Cache) {
  const rows = p.rows ?? 10;
  const dropped = Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<DropReason, number>;
  const kept: Opportunity[] = [];
  let start = p.offset ?? 0;
  let total = 0;
  let scanned = 0;
  let pages = 0;
  let nextOffset: number | null = null;
  while (pages < MAX_PAGES) {
    const res = await searchGrants({ ...p, rows: PAGE_ROWS, offset: start }, cache);
    pages++;
    total = res.total;
    for (const [i, o] of res.opportunities.entries()) {
      scanned++;
      const reason = dropReason(o, f);
      if (reason) dropped[reason]++;
      else kept.push(o);
      if (kept.length === rows) {
        nextOffset = start + i + 1 < total ? start + i + 1 : null;
        return { total, scanned, pages, dropped, opportunities: kept, nextOffset, exhausted: nextOffset === null };
      }
    }
    start += res.opportunities.length;
    if (res.opportunities.length === 0 || start >= total) break;
  }
  nextOffset = start < total ? start : null;
  return { total, scanned, pages, dropped, opportunities: kept, nextOffset, exhausted: nextOffset === null };
}
