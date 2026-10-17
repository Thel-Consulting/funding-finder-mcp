import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { denverToday, dropReason, isOverseasMission, isoDate, parseGrantsResponse, type GrantsFilters } from "../../src/sources/grants.js";

// Real Grants.gov search2 records (eligibility 12|06|00|02|04), trimmed to 11.
const { opportunities } = parseGrantsResponse(JSON.parse(readFileSync(new URL("../fixtures/grants-filters.json", import.meta.url), "utf8")));
const byNumber = (n: string) => {
  const o = opportunities.find((x) => x.number === n);
  if (!o) throw new Error(`fixture missing ${n}`);
  return o;
};

const defaults: GrantsFilters = {
  openOnly: true,
  excludeNoCloseDate: false,
  forecastMaxAgeDays: 365,
  rollingMaxAgeDays: 1460,
  domesticOnly: true,
  today: "2026-10-17",
};
const off: GrantsFilters = { ...defaults, openOnly: false, forecastMaxAgeDays: 0, rollingMaxAgeDays: 0, domesticOnly: false };

describe("Grants.gov filters", () => {
  it("parses dates and today in America/Denver", () => {
    expect(isoDate("03/15/2021")).toBe("2021-03-15");
    expect(isoDate(null)).toBeNull();
    // 03:00 UTC on Oct 17 is still Oct 16 in Denver.
    expect(denverToday(new Date("2026-10-17T03:00:00Z"))).toBe("2026-10-16");
  });

  it("detects overseas missions by DOS-* code plus mission or embassy naming", () => {
    expect(isOverseasMission(byNumber("PAS-TUNIS-FY2025"))).toBe(true);
    expect(isOverseasMission(byNumber("PDS-CAIRO-001-FY25"))).toBe(true);
    expect(isOverseasMission(byNumber("DFOP0017204"))).toBe(false); // DOS-ECA, a Washington bureau
    expect(isOverseasMission(byNumber("PRM-A-NOI-01"))).toBe(false);
    expect(isOverseasMission(byNumber("PAR-25-274"))).toBe(false);
  });

  it("default filters drop the stale noise and keep live and rolling programs", () => {
    const reasons = Object.fromEntries(opportunities.map((o) => [o.number, dropReason(o, defaults)]));
    expect(reasons).toEqual({
      "PAS-TUNIS-FY2025": "overseas_mission",
      "PDS-CAIRO-001-FY25": "overseas_mission",
      "EDA-DEN-TA-DRO-2021-2006850": "stale_rolling",
      PWEAA2023: null,
      "EDA-DISASTER-2025": null,
      "VA-GRANTS-112508-002": "stale_rolling",
      DFOP0017204: null,
      "PRM-A-NOI-01": "stale_forecast",
      "FOR-MD-25-005": "stale_forecast",
      "RFA-HG-28-005": null,
      "PAR-25-274": null,
    });
  });

  it("open_only drops a posted record once its close date has passed", () => {
    const o = byNumber("PAR-25-274"); // closes 11/17/2026
    expect(dropReason(o, { ...off, openOnly: true, today: "2026-11-17" })).toBeNull();
    expect(dropReason(o, { ...off, openOnly: true, today: "2026-11-18" })).toBe("closed");
    expect(dropReason(o, { ...off, today: "2026-11-18" })).toBeNull();
  });

  it("exclude_no_close_date applies to posted records only", () => {
    const f = { ...off, excludeNoCloseDate: true };
    expect(dropReason(byNumber("PWEAA2023"), f)).toBe("no_close_date");
    expect(dropReason(byNumber("RFA-HG-28-005"), f)).toBeNull();
    expect(dropReason(byNumber("PAR-25-274"), f)).toBeNull();
  });

  it("posted_after drops anything opened before the cutoff", () => {
    const f = { ...off, postedAfter: "2026-01-01" };
    expect(dropReason(byNumber("EDA-DISASTER-2025"), f)).toBe("posted_before_cutoff");
    expect(dropReason(byNumber("FOR-MD-25-005"), f)).toBe("posted_before_cutoff");
    expect(dropReason(byNumber("RFA-HG-28-005"), f)).toBeNull();
  });

  it("all filters off keeps every record", () => {
    expect(opportunities.every((o) => dropReason(o, off) === null)).toBe(true);
  });
});
