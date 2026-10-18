import { fetchJson, UpstreamError, type Cache } from "./http.js";

export const NSF_ENDPOINTS = [
  "https://www.research.gov/awardapi-service/v1/awards.json",
  "https://api.nsf.gov/services/v1/awards.json",
];
export const NSF_DOCS_URL = "https://resources.research.gov/common/webapi/awardapisearch-v1.htm";
export const NSF_MAX_RPP = 25;

export interface NsfSearchParams {
  keyword?: string;
  state?: string;
  awardDateFrom?: string;
  awardDateTo?: string;
  sbirSttrOnly?: boolean;
  fundProgramName?: string;
  rpp?: number;
  offset?: number;
}

export interface RawNsfAward {
  id: string;
  title?: string;
  awardeeName?: string;
  awardeeCity?: string;
  awardeeStateCode?: string;
  fundsObligatedAmt?: string;
  estimatedTotalAmt?: string;
  date?: string;
  startDate?: string;
  expDate?: string;
  fundProgramName?: string;
  abstractText?: string;
  agency?: string;
}

export interface RawNsfResponse {
  response: {
    award?: RawNsfAward[];
    metadata?: { totalCount?: number; offset?: number; rpp?: number };
    serviceNotification?: { notificationType?: string; notificationMessage?: string }[];
  };
}

export interface NsfAward {
  source: "NSF Award Search";
  id: string;
  title: string;
  organization: string | null;
  city: string | null;
  state: string | null;
  program: string | null;
  awardDate: string | null;
  startDate: string | null;
  endDate: string | null;
  fundsObligated: number | null;
  estimatedTotal: number | null;
  abstract?: string;
  url: string;
}

// NSF's fundProgramName filter is a word match, so "SBIR OR STTR" also returns
// awards from programs that only mention SBIR or STTR in their name (outreach
// and technical assistance, SBIR/STTR operations, the commercialization
// institute) and multi-program awards that SBIR/STTR money co-funded (research
// centers, I-Corps, fellowships, conferences). A company award has a Phase I,
// Phase II or Fast-Track program component, and:
// - from FY1997 (award date 1996-10-01) on, a title that starts with the phase,
//   which NSF uses for every company award ("SBIR Phase I: ...");
// - before that, when titles did not name the phase, no program component
//   other than SBIR/STTR programs and EPSCoR co-funding.
export const NSF_SBIR_STTR_PROGRAMS = new Set([
  "SBIR Phase I",
  "SBIR Phase II",
  "STTR Phase I",
  "STTR Phase II",
  "SBIR Fast-Track",
  "STTR Fast-Track",
]);
const PRE_FY1997_ALLOWED = new Set([...NSF_SBIR_STTR_PROGRAMS, "SBIR/STTR Operations", "EPSCoR Co-Funding"]);
const PHASE_TITLE = /^\s*((SBIR|STTR)(\s*\/\s*(SBIR|STTR))?[\s/:]*)?(Phase\s*(I{1,2}B?|1|2)|Fast[- ]?Track)\b/i;
const PHASE_TITLE_FROM = "1996-10-01";

export function isSbirSttrCompanyAward(a: { program?: string | null; title?: string | null; awardDate?: string | null }) {
  const parts = (a.program ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.some((p) => NSF_SBIR_STTR_PROGRAMS.has(p))) return false;
  if (PHASE_TITLE.test(a.title ?? "")) return true;
  return !!a.awardDate && a.awardDate < PHASE_TITLE_FROM && parts.every((p) => PRE_FY1997_ALLOWED.has(p));
}

export function isoToNsfDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date "${iso}", expected YYYY-MM-DD`);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export function nsfDateToIso(d?: string) {
  const m = d ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d) : null;
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

export function buildNsfQuery(p: NsfSearchParams) {
  const q = new URLSearchParams();
  if (p.keyword?.trim()) q.set("keyword", p.keyword.trim());
  if (p.state) q.set("awardeeStateCode", p.state.toUpperCase());
  if (p.awardDateFrom) q.set("dateStart", isoToNsfDate(p.awardDateFrom));
  if (p.awardDateTo) q.set("dateEnd", isoToNsfDate(p.awardDateTo));
  const program = p.fundProgramName ?? (p.sbirSttrOnly ? "SBIR OR STTR" : undefined);
  if (program) q.set("fundProgramName", program);
  q.set("rpp", String(Math.min(p.rpp ?? 10, NSF_MAX_RPP)));
  q.set("offset", String(p.offset ?? 0));
  return q.toString();
}

const num = (s?: string) => {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const clean = (s?: string) => (s && s.trim() ? s.trim() : null);

export function parseNsfAward(a: RawNsfAward, includeAbstract = false): NsfAward {
  const out: NsfAward = {
    source: "NSF Award Search",
    id: a.id,
    title: clean(a.title)?.replace(/\s{2,}/g, " ") ?? "(untitled)",
    organization: clean(a.awardeeName),
    city: clean(a.awardeeCity),
    state: clean(a.awardeeStateCode),
    program: clean(a.fundProgramName),
    awardDate: nsfDateToIso(a.date),
    startDate: nsfDateToIso(a.startDate),
    endDate: nsfDateToIso(a.expDate),
    fundsObligated: num(a.fundsObligatedAmt),
    estimatedTotal: num(a.estimatedTotalAmt),
    url: `https://www.nsf.gov/awardsearch/show-award?AWD_ID=${a.id}`,
  };
  if (includeAbstract && a.abstractText) out.abstract = a.abstractText.trim();
  return out;
}

export function parseNsfResponse(raw: RawNsfResponse, includeAbstract = false) {
  const r = raw?.response;
  if (!r) throw new UpstreamError("NSF Award Search", NSF_ENDPOINTS[0], "unexpected response shape");
  const errors = (r.serviceNotification ?? []).filter((n) => n.notificationType === "ERROR");
  if (errors.length) {
    throw new UpstreamError("NSF Award Search", NSF_ENDPOINTS[0], errors.map((e) => e.notificationMessage).join("; "));
  }
  const awards = (r.award ?? []).map((a) => parseNsfAward(a, includeAbstract));
  return { total: r.metadata?.totalCount ?? awards.length, awards };
}

const AWARD_FIELDS = [
  "id",
  "title",
  "awardeeName",
  "awardeeCity",
  "awardeeStateCode",
  "fundsObligatedAmt",
  "estimatedTotalAmt",
  "date",
  "startDate",
  "expDate",
  "fundProgramName",
  "abstractText",
  "agency",
] as const;

// NSF ignores printFields and returns full records, including PI and program
// officer names, emails and phone numbers. Keep only the listed award fields
// and the total count. Responses with service notifications are not cached.
export function sanitizeNsfResponse(data: unknown) {
  const r = (data as RawNsfResponse)?.response;
  if (!r || r.serviceNotification?.length) return undefined;
  return {
    response: {
      metadata: { totalCount: r.metadata?.totalCount },
      award: (r.award ?? []).map((a) => Object.fromEntries(AWARD_FIELDS.filter((k) => k in a).map((k) => [k, a[k]]))),
    },
  };
}

export async function searchNsf(p: NsfSearchParams & { includeAbstract?: boolean; timeoutMs?: number; fallback?: boolean }, cache?: Cache) {
  const qs = buildNsfQuery(p);
  let lastErr: unknown;
  const endpoints = p.fallback === false ? NSF_ENDPOINTS.slice(0, 1) : NSF_ENDPOINTS;
  for (const base of endpoints) {
    const url = `${base}?${qs}`;
    try {
      const raw = await fetchJson<RawNsfResponse>({
        source: "NSF Award Search",
        url,
        cache,
        ttlSeconds: 3600,
        timeoutMs: p.timeoutMs ?? 8000,
        sanitize: sanitizeNsfResponse,
      });
      const parsed = parseNsfResponse(raw, p.includeAbstract);
      const filter = p.sbirSttrOnly && !p.fundProgramName;
      const awards = filter ? parsed.awards.filter((a) => isSbirSttrCompanyAward(a)) : parsed.awards;
      const excluded = filter ? parsed.awards.filter((a) => !isSbirSttrCompanyAward(a)) : [];
      return { total: parsed.total, awards, excluded, pageSize: parsed.awards.length, queryUrl: url };
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status && err.status < 500) throw err;
    }
  }
  throw lastErr;
}
