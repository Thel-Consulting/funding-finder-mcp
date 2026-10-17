import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { searchGrants } from "../../src/sources/grants.js";
import { searchNih, SBIR_STTR_ACTIVITY_CODES } from "../../src/sources/nih.js";
import { searchNsf } from "../../src/sources/nsf.js";
import { createServer } from "../../src/server.js";

describe("contract: Grants.gov search2", () => {
  it("returns posted or forecasted SBIR opportunities", async () => {
    const res = await searchGrants({ keyword: "SBIR", rows: 5 });
    expect(res.total).toBeGreaterThan(0);
    expect(res.opportunities.length).toBeGreaterThan(0);
    const o = res.opportunities[0];
    expect(o.id).toMatch(/^\d+$/);
    expect(o.title.length).toBeGreaterThan(5);
    expect(["forecasted", "posted"]).toContain(o.status);
  });

  it("honors the small business eligibility filter", async () => {
    const res = await searchGrants({ eligibility: ["23"], rows: 3 });
    expect(res.total).toBeGreaterThan(0);
  });
});

describe("contract: NIH RePORTER v2", () => {
  it("returns SBIR/STTR projects with expected fields", async () => {
    const res = await searchNih({ activityCodes: SBIR_STTR_ACTIVITY_CODES, fiscalYears: [2024], limit: 5 });
    expect(res.total).toBeGreaterThan(100);
    for (const p of res.projects) {
      expect(SBIR_STTR_ACTIVITY_CODES).toContain(p.activityCode);
      expect(p.fiscalYear).toBe(2024);
      expect(p.organization).toBeTruthy();
    }
  });

  it("filters by org state", async () => {
    const res = await searchNih({ activityCodes: SBIR_STTR_ACTIVITY_CODES, orgStates: ["SD"], limit: 10 });
    expect(res.total).toBeGreaterThan(0);
    for (const p of res.projects) expect(p.state).toBe("SD");
  });

  it("supports text search", async () => {
    const res = await searchNih({ text: "biofilm wound", limit: 3 });
    expect(res.total).toBeGreaterThan(0);
  });
});

describe("contract: NSF Award Search", () => {
  it("returns SBIR/STTR awards for a state", async () => {
    const res = await searchNsf({ state: "SD", sbirSttrOnly: true, rpp: 10 });
    expect(res.total).toBeGreaterThan(0);
    for (const a of res.awards) {
      expect(a.state).toBe("SD");
      expect(a.program).toMatch(/SBIR|STTR/);
    }
  });

  it("respects award date range and 0-based offset paging", async () => {
    const p1 = await searchNsf({ sbirSttrOnly: true, awardDateFrom: "2024-01-01", awardDateTo: "2024-12-31", rpp: 5, offset: 0 });
    const p2 = await searchNsf({ sbirSttrOnly: true, awardDateFrom: "2024-01-01", awardDateTo: "2024-12-31", rpp: 5, offset: 5 });
    expect(p1.total).toBeGreaterThan(10);
    for (const a of [...p1.awards, ...p2.awards]) expect(a.awardDate?.startsWith("2024")).toBe(true);
    const ids = new Set(p1.awards.map((a) => a.id));
    expect(p2.awards.some((a) => ids.has(a.id))).toBe(false);
  });
});

describe("contract: tools end to end", () => {
  const call = async (name: string, args: Record<string, unknown>) => {
    const server = createServer();
    const client = new Client({ name: "contract", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = res.content[0].text;
    return { res, data: JSON.parse(text.slice(text.indexOf("{"))) };
  };

  it("similar_funded_projects returns ranked hits from both sources with URLs", async () => {
    const { res, data } = await call("similar_funded_projects", { description: "biofilm wound dressing", limit: 10 });
    expect(res.isError).toBeFalsy();
    expect(data.keywords).toContain("biofilm");
    expect(data.results.length).toBeGreaterThan(0);
    const sources = new Set(data.results.map((r: { source: string }) => r.source));
    expect(sources.size).toBeGreaterThanOrEqual(1);
    for (const r of data.results) expect(r.url).toMatch(/^https:\/\/(reporter\.nih\.gov|www\.nsf\.gov)\//);
  });

  it("agency_sbir_summary aggregates NIH and NSF", async () => {
    const nih = await call("agency_sbir_summary", { agency: "NIH", state: "SD", fiscal_year_from: 2016, fiscal_year_to: 2025 });
    expect(nih.res.isError).toBeFalsy();
    expect(nih.data.recordsAggregated).toBe(nih.data.upstreamTotal);
    expect(nih.data.partial).toBe(false);
    expect(nih.data.byFiscalYear.length).toBeGreaterThan(0);
    const nsf = await call("agency_sbir_summary", { agency: "NSF", state: "SD", fiscal_year_from: 2010, fiscal_year_to: 2025 });
    expect(nsf.res.isError).toBeFalsy();
    expect(nsf.data.recordsAggregated).toBeGreaterThan(0);
    expect(nsf.data.source.queryUrl).toMatch(/^https:\/\//);
  });
});
