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
