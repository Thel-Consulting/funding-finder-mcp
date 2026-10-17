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

export async function searchNsf(p: NsfSearchParams & { includeAbstract?: boolean; timeoutMs?: number; fallback?: boolean }, cache?: Cache) {
  const qs = buildNsfQuery(p);
  let lastErr: unknown;
  const endpoints = p.fallback === false ? NSF_ENDPOINTS.slice(0, 1) : NSF_ENDPOINTS;
  for (const base of endpoints) {
    const url = `${base}?${qs}`;
    try {
      const raw = await fetchJson<RawNsfResponse>({ source: "NSF Award Search", url, cache, ttlSeconds: 3600, timeoutMs: p.timeoutMs ?? 8000 });
      return { ...parseNsfResponse(raw, p.includeAbstract), queryUrl: url };
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status && err.status < 500) throw err;
    }
  }
  throw lastErr;
}
