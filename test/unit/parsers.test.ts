import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildGrantsBody, decodeEntities, parseGrantsResponse } from "../../src/sources/grants.js";
import { buildNihBody, parseNihProject, type RawNihResponse } from "../../src/sources/nih.js";
import { buildNsfQuery, isoToNsfDate, nsfDateToIso, parseNsfResponse } from "../../src/sources/nsf.js";
import { UpstreamError } from "../../src/sources/http.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("Grants.gov", () => {
  it("builds a search2 body with defaults", () => {
    expect(buildGrantsBody({ keyword: "SBIR" })).toEqual({
      keyword: "SBIR",
      agencies: "",
      eligibilities: "",
      oppStatuses: "forecasted|posted",
      rows: 10,
      startRecordNum: 0,
    });
    expect(buildGrantsBody({ eligibility: ["23", "12"], status: ["posted"], rows: 5, offset: 10 })).toMatchObject({
      eligibilities: "23|12",
      oppStatuses: "posted",
      rows: 5,
      startRecordNum: 10,
    });
  });

  it("parses a real search2 response and links each opportunity", () => {
    const res = parseGrantsResponse(fixture("grants-search2.json"));
    expect(res.total).toBeGreaterThan(0);
    expect(res.opportunities.length).toBe(3);
    for (const o of res.opportunities) {
      expect(o.url).toBe(`https://www.grants.gov/search-results-detail/${o.id}`);
      expect(o.title).not.toMatch(/&[a-z]+;/);
      expect(["forecasted", "posted"]).toContain(o.status);
    }
  });

  it("raises an UpstreamError on a non-zero errorcode", () => {
    expect(() => parseGrantsResponse({ errorcode: 1, msg: "bad request" })).toThrow(UpstreamError);
  });

  it("decodes HTML entities", () => {
    expect(decodeEntities("Program&rsquo;s &amp; more")).toBe("Program's & more");
  });
});

describe("NIH RePORTER", () => {
  it("builds criteria with upper-cased codes and text search", () => {
    const body = buildNihBody({ activityCodes: ["r43"], orgStates: ["sd"], institutes: ["nci"], fiscalYears: [2024], text: " wound ", limit: 5 });
    expect(body.criteria).toEqual({
      activity_codes: ["R43"],
      org_states: ["SD"],
      agencies: ["NCI"],
      fiscal_years: [2024],
      advanced_text_search: { operator: "and", search_field: "projecttitle,terms,abstracttext", search_text: "wound" },
    });
    expect(body.limit).toBe(5);
    expect(body.include_fields).not.toContain("AbstractText");
  });

  it("parses real projects", () => {
    const raw = fixture("nih-search.json") as RawNihResponse;
    expect(raw.meta.total).toBeGreaterThan(0);
    const p = parseNihProject(raw.results[0]);
    expect(p.source).toBe("NIH RePORTER");
    expect(p.state).toBe("SD");
    expect(p.url).toBe(`https://reporter.nih.gov/project-details/${raw.results[0].appl_id}`);
    expect(typeof p.awardAmount).toBe("number");
    expect(p.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles missing fields", () => {
    const p = parseNihProject({ appl_id: 1 });
    expect(p).toMatchObject({ title: "(untitled)", organization: null, awardAmount: null });
  });
});

describe("NSF Award Search", () => {
  it("converts dates both ways", () => {
    expect(isoToNsfDate("2020-01-31")).toBe("01/31/2020");
    expect(nsfDateToIso("12/15/2020")).toBe("2020-12-15");
    expect(nsfDateToIso(undefined)).toBeNull();
    expect(() => isoToNsfDate("2020/01/31")).toThrow();
  });

  it("builds a query with SBIR/STTR filter and caps rpp at 25", () => {
    const q = new URLSearchParams(buildNsfQuery({ keyword: "biofilm", state: "sd", sbirSttrOnly: true, rpp: 100, awardDateFrom: "2020-01-01" }));
    expect(q.get("fundProgramName")).toBe("SBIR OR STTR");
    expect(q.get("awardeeStateCode")).toBe("SD");
    expect(q.get("rpp")).toBe("25");
    expect(q.get("dateStart")).toBe("01/01/2020");
    expect(q.get("offset")).toBe("0");
  });

  it("parses real awards", () => {
    const res = parseNsfResponse(fixture("nsf-awards.json"));
    expect(res.total).toBeGreaterThan(0);
    expect(res.awards.length).toBe(3);
    for (const a of res.awards) {
      expect(a.state).toBe("SD");
      expect(a.program).toMatch(/SBIR|STTR/);
      expect(a.url).toBe(`https://www.nsf.gov/awardsearch/show-award?AWD_ID=${a.id}`);
      expect(a.title).not.toMatch(/\s{2,}/);
      expect(a).not.toHaveProperty("abstract");
    }
  });

  it("raises on service error notifications", () => {
    expect(() =>
      parseNsfResponse({ response: { serviceNotification: [{ notificationType: "ERROR", notificationMessage: "Invalid date" }] } }),
    ).toThrow(/Invalid date/);
  });
});
