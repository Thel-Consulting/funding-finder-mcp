import { fetchJson, type Cache } from "./http.js";

export const NIH_SEARCH_URL = "https://api.reporter.nih.gov/v2/projects/search";
export const NIH_DOCS_URL = "https://api.reporter.nih.gov/";
export const SBIR_STTR_ACTIVITY_CODES = ["R43", "R44", "R41", "R42"];

export interface NihSearchParams {
  activityCodes?: string[];
  orgStates?: string[];
  text?: string;
  textOperator?: "and" | "or";
  institutes?: string[];
  fiscalYears?: number[];
  limit?: number;
  offset?: number;
  includeAbstract?: boolean;
  fields?: string[];
  timeoutMs?: number;
}

interface RawOrg {
  org_name?: string;
  org_city?: string;
  org_state?: string;
}

export interface RawNihProject {
  appl_id: number;
  project_num?: string;
  project_title?: string;
  fiscal_year?: number;
  award_amount?: number | null;
  activity_code?: string;
  organization?: RawOrg;
  agency_ic_admin?: { abbreviation?: string; name?: string };
  project_start_date?: string | null;
  project_end_date?: string | null;
  abstract_text?: string | null;
  terms?: string | null;
}

export interface RawNihResponse {
  meta: { total: number; offset: number; limit: number };
  results: RawNihProject[];
}

export interface NihProject {
  source: "NIH RePORTER";
  applId: number;
  projectNumber: string | null;
  title: string;
  organization: string | null;
  city: string | null;
  state: string | null;
  fiscalYear: number | null;
  awardAmount: number | null;
  activityCode: string | null;
  institute: string | null;
  startDate: string | null;
  endDate: string | null;
  abstract?: string;
  url: string;
}

const DEFAULT_FIELDS = [
  "ApplId",
  "ProjectNum",
  "ProjectTitle",
  "FiscalYear",
  "AwardAmount",
  "ActivityCode",
  "Organization",
  "AgencyIcAdmin",
  "ProjectStartDate",
  "ProjectEndDate",
];

export function buildNihBody(p: NihSearchParams) {
  const criteria: Record<string, unknown> = {};
  if (p.activityCodes?.length) criteria.activity_codes = p.activityCodes.map((c) => c.toUpperCase());
  if (p.orgStates?.length) criteria.org_states = p.orgStates.map((s) => s.toUpperCase());
  if (p.institutes?.length) criteria.agencies = p.institutes.map((s) => s.toUpperCase());
  if (p.fiscalYears?.length) criteria.fiscal_years = p.fiscalYears;
  if (p.text?.trim()) {
    criteria.advanced_text_search = {
      operator: p.textOperator ?? "and",
      search_field: "projecttitle,terms,abstracttext",
      search_text: p.text.trim(),
    };
  }
  const fields = p.fields ?? [...DEFAULT_FIELDS, ...(p.includeAbstract ? ["AbstractText"] : [])];
  return { criteria, include_fields: fields, offset: p.offset ?? 0, limit: p.limit ?? 10 };
}

const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);

export function parseNihProject(r: RawNihProject, includeAbstract = false): NihProject {
  const p: NihProject = {
    source: "NIH RePORTER",
    applId: r.appl_id,
    projectNumber: clean(r.project_num),
    title: clean(r.project_title) ?? "(untitled)",
    organization: clean(r.organization?.org_name),
    city: clean(r.organization?.org_city),
    state: clean(r.organization?.org_state),
    fiscalYear: r.fiscal_year ?? null,
    awardAmount: typeof r.award_amount === "number" ? r.award_amount : null,
    activityCode: clean(r.activity_code),
    institute: clean(r.agency_ic_admin?.abbreviation),
    startDate: r.project_start_date ? r.project_start_date.slice(0, 10) : null,
    endDate: r.project_end_date ? r.project_end_date.slice(0, 10) : null,
    url: `https://reporter.nih.gov/project-details/${r.appl_id}`,
  };
  if (includeAbstract && r.abstract_text) p.abstract = r.abstract_text.trim();
  return p;
}

export async function searchNihRaw(p: NihSearchParams, cache?: Cache) {
  return fetchJson<RawNihResponse>({
    source: "NIH RePORTER",
    url: NIH_SEARCH_URL,
    method: "POST",
    body: buildNihBody(p),
    cache,
    ttlSeconds: 3600,
    timeoutMs: p.timeoutMs ?? 8000,
  });
}

export async function searchNih(p: NihSearchParams, cache?: Cache) {
  const raw = await searchNihRaw(p, cache);
  return {
    total: raw.meta.total,
    projects: raw.results.map((r) => parseNihProject(r, p.includeAbstract)),
  };
}
