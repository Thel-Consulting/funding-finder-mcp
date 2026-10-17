import { describe, expect, it } from "vitest";
import { extractKeywords, similarity } from "../../src/keywords.js";
import { RateLimiter, hashKey } from "../../src/ratelimit.js";
import { aggregateNih, fiscalYearOf } from "../../src/summary.js";
import { MemoryCache, fetchJson, UpstreamError } from "../../src/sources/http.js";

describe("keywords", () => {
  it("drops stopwords and keeps order by frequency", () => {
    expect(extractKeywords("A novel biofilm wound dressing for chronic wound care")).toEqual(["wound", "biofilm", "dressing", "chronic", "care"]);
  });

  it("scores title matches above body matches", () => {
    const k = ["biofilm", "wound", "dressing"];
    const title = similarity(k, "Biofilm wound dressings");
    const body = similarity(k, "Something else", "biofilm wound dressing");
    expect(title.score).toBeGreaterThan(body.score);
    expect(title.matched).toEqual(k);
    expect(similarity([], "x").score).toBe(0);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 10).allowed).toBe(true);
    const third = rl.check("a", 20);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBe(1);
    expect(rl.check("b", 20).allowed).toBe(true);
    expect(rl.check("a", 1001).allowed).toBe(true);
  });

  it("hashes keys so raw IPs are not stored", async () => {
    const h = await hashKey("203.0.113.9", "salt");
    expect(h).toMatch(/^[0-9a-f]{24}$/);
    expect(h).not.toContain("203");
  });
});

describe("summary helpers", () => {
  it("derives the federal fiscal year from a date", () => {
    expect(fiscalYearOf("2020-09-30")).toBe(2020);
    expect(fiscalYearOf("2020-10-01")).toBe(2021);
    expect(fiscalYearOf(null)).toBeNull();
  });

  it("aggregates NIH rows by year, code, state and org", () => {
    const agg = aggregateNih(
      [
        { appl_id: 1, fiscal_year: 2024, award_amount: 100, activity_code: "R43", organization: { org_name: "A", org_state: "SD" } },
        { appl_id: 2, fiscal_year: 2024, award_amount: 50, activity_code: "R44", organization: { org_name: "B", org_state: "ND" } },
        { appl_id: 3, fiscal_year: 2025, award_amount: null, activity_code: "R43", organization: { org_name: "A", org_state: "SD" } },
      ],
      true,
    );
    expect(agg.totalAmount).toBe(150);
    expect(agg.byFiscalYear).toEqual([
      { key: "2024", count: 2, amount: 150 },
      { key: "2025", count: 1, amount: 0 },
    ]);
    expect(agg.byState?.[0]).toEqual({ key: "SD", count: 2, amount: 100 });
    expect(agg.topOrganizations[0].key).toBe("A");
  });
});

describe("http", () => {
  it("memory cache expires entries", async () => {
    const c = new MemoryCache(2);
    await c.put("a", "1", 60);
    expect(await c.get("a")).toBe("1");
    await c.put("b", "2", -1);
    expect(await c.get("b")).toBeNull();
  });

  it("reports a clear error when the upstream is unreachable", async () => {
    await expect(fetchJson({ source: "Test", url: "http://127.0.0.1:9/nothing", timeoutMs: 2000 })).rejects.toThrow(UpstreamError);
    await expect(fetchJson({ source: "Test", url: "http://127.0.0.1:9/nothing", timeoutMs: 2000 })).rejects.toThrow(/Test request failed/);
  });
});
