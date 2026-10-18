import { afterEach, describe, expect, it, vi } from "vitest";
import { isSbirSttrCompanyAward, searchNsf } from "../../src/sources/nsf.js";
import { NSF_FULL_PAGES, nihYearRows, planYearPages, summarizeNsf } from "../../src/summary.js";

// Real NSF records (program, title, award date) that "SBIR OR STTR" matches.
const NON_COMPANY = [
  ["SBIR Commercialization", "Center: National Commercialization and Translation Institute (NCTI) Pilot Program", "2026-08-06"],
  ["SBIR Outreach & Tech. Assist", "Pilot on Enhancing EPSCoR State Proposal Success Rate & Mastering Negotiation Skills", "2026-08-17"],
  ["POSE, POSE, SBIR/STTR Operations, TIP-CHIPS KTA-3 Quantum, I-Corps, Special Projects", "I-Corps: Continuation and Expansion of Training and Evaluation Support", "2023-09-08"],
  ["Special Projects - CNS, IUCRC-Indust-Univ Coop Res Ctr, STTR Phase I, SBIR Phase I, I-Corps-Nodes, I-Corps", "I-Corps: Virtual Training, Evaluation, and Tracking of Program Impact", "2020-08-11"],
  ["EWFD-Eng Workforce Development, ERC-Eng Research Centers, RET SUPPLEMENTS, SBIR Phase II", "Engineering Research Center for Extreme Ultraviolet Science and Technology", "2003-09-24"],
  ["SBIR Phase II", "Workshop: IT Security Conference", "2008-09-03"],
  ["EWFD-Eng Workforce Development, SSA-Special Studies & Analysis, SBIR Phase II", "University of Washington Engineered Biomaterials (UWEB)", "1996-08-21"],
] as const;
const COMPANY = [
  ["SBIR Phase I", "SBIR Phase I:  A language learning app", "2023-09-21"],
  ["SBIR Phase I, SBIR Outreach & Tech. Assist", "SBIR Phase I:  College Bound Video Game", "2023-02-13"],
  ["STTR Phase I, STTR Phase II, SBIR Phase II", "STTR Phase II: Sensor", "2019-05-01"],
  ["SBIR Fast-Track", "SBIR Fast-Track: Scalable Robotic Skill Learning", "2025-03-01"],
  ["SBIR Phase II, EPSCoR Co-Funding", "SBIR Phase II: Satellite data", "2020-04-01"],
  ["SBIR Phase I", "SBIR/Phase I:    Native Accent Pitch", "2003-01-15"],
  ["SBIR Phase II", "SBIR: Phase II:  Removal of Contaminants from Soil", "1999-07-27"],
  ["SBIR Phase I", "A High Precision Ultrasonic Chilled Surface Dew Point Sensor", "1995-01-12"],
  ["SBIR/STTR Operations, SBIR Phase II", "Two-Dimensional Guided Wave Spatial Light Controller", "1992-09-30"],
] as const;

describe("NSF company-award filter", () => {
  it("drops outreach, operations, centers, I-Corps and workshops", () => {
    for (const [program, title, awardDate] of NON_COMPANY) expect(isSbirSttrCompanyAward({ program, title, awardDate }), title).toBe(false);
  });
  it("keeps Phase I, Phase II and Fast-Track company awards, including co-funded and pre-FY1997 ones", () => {
    for (const [program, title, awardDate] of COMPANY) expect(isSbirSttrCompanyAward({ program, title, awardDate }), title).toBe(true);
  });
});

// A fake NSF Award Search API over a generated set of awards.
interface Fake {
  id: string;
  title: string;
  fundProgramName: string;
  date: string;
  fundsObligatedAmt: string;
  awardeeName: string;
  awardeeStateCode: string;
}
const mdy = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1");
const iso = (m: string) => m.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2");
function fakeNsf(awards: Fake[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      calls.push(input);
      const u = new URL(input);
      const from = iso(u.searchParams.get("dateStart") ?? "01/01/1900");
      const to = iso(u.searchParams.get("dateEnd") ?? "12/31/2999");
      const state = u.searchParams.get("awardeeStateCode");
      const match = awards
        .filter((a) => iso(a.date) >= from && iso(a.date) <= to && (!state || a.awardeeStateCode === state))
        .sort((a, b) => iso(b.date).localeCompare(iso(a.date)));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const rpp = Number(u.searchParams.get("rpp") ?? 25);
      return new Response(JSON.stringify({ response: { award: match.slice(offset, offset + rpp), metadata: { totalCount: match.length } } }));
    }),
  );
  return calls;
}
function makeAwards(perYear: Record<number, number>, leakEvery = 0) {
  const out: Fake[] = [];
  for (const [fy, n] of Object.entries(perYear)) {
    for (let i = 0; i < n; i++) {
      const day = new Date(Date.UTC(Number(fy) - 1, 9, 1) + Math.floor((i * 360 * 86400000) / n));
      const leak = leakEvery > 0 && i % leakEvery === 0;
      out.push({
        id: `${fy}${String(i).padStart(4, "0")}`,
        title: leak ? "Center: Commercialization Institute" : `SBIR Phase I: Project ${i}`,
        fundProgramName: leak ? "SBIR Commercialization" : "SBIR Phase I",
        date: mdy(day.toISOString().slice(0, 10)),
        fundsObligatedAmt: leak ? "20000000" : "100000",
        awardeeName: leak ? "Big University" : `Company ${i}`,
        awardeeStateCode: i % 2 ? "SD" : "CA",
      });
    }
  }
  return out;
}

describe("NSF search and summary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("search drops non-company awards only when sbirSttrOnly is set", async () => {
    fakeNsf(makeAwards({ 2025: 20 }, 5));
    const on = await searchNsf({ sbirSttrOnly: true, rpp: 25 });
    expect(on.total).toBe(20);
    expect(on.awards).toHaveLength(16);
    expect(on.excluded.map((a) => a.program)).toEqual(Array(4).fill("SBIR Commercialization"));
    const off = await searchNsf({ sbirSttrOnly: false, rpp: 25 });
    expect(off.awards).toHaveLength(20);
    expect(off.excluded).toHaveLength(0);
  });

  it("small result sets are complete, with leaks excluded from totals", async () => {
    fakeNsf(makeAwards({ 2024: 30, 2025: 20 }, 10));
    const s = await summarizeNsf({ from: 2023, to: 2025 });
    expect(s.partial).toBe(false);
    expect(s.byFiscalYear.map((y) => [y.key, y.status, y.count, y.excluded])).toEqual([
      ["2023", "complete", 0, 0],
      ["2024", "complete", 27, 3],
      ["2025", "complete", 18, 2],
    ]);
    expect(s.totalAmount).toBe(45 * 100000);
    expect(s.excludedNonCompany.count).toBe(5);
    expect(s.topOrganizations.every((o) => o.key.startsWith("Company"))).toBe(true);
  });

  it("large result sets sample every year instead of reporting older years as 0", async () => {
    const perYear = { 2022: 448, 2023: 422, 2024: 420, 2025: 319, 2026: 190, 2027: 0 };
    fakeNsf(makeAwards(perYear));
    const s = await summarizeNsf({ from: 2022, to: 2027 });
    expect(s.upstreamTotal).toBeGreaterThan(NSF_FULL_PAGES * 25);
    expect(s.partial).toBe(true);
    for (const y of s.byFiscalYear) {
      const n = perYear[Number(y.key) as keyof typeof perYear];
      expect(y.upstreamCount).toBe(n);
      expect(y.status).toBe(y.fetched >= n ? "complete" : "partial");
      if (n > 0) expect(y.count).toBeGreaterThanOrEqual(50);
    }
    // The old newest-first paging reported FY2022 as 0 of 448.
    expect(s.byFiscalYear.find((y) => y.key === "2022")).toMatchObject({ status: "partial", upstreamCount: 448 });
    expect(s.partialNote).toMatch(/sampled/);
    expect(s.incompleteYears).toEqual(["2022", "2023", "2024", "2025"]);
  });

  it("plans pages round-robin across years within the budget", () => {
    expect(planYearPages([{ fy: 2026, pagesNeeded: 3 }, { fy: 2025, pagesNeeded: 2 }, { fy: 2024, pagesNeeded: 1 }], 10)).toEqual([
      { fy: 2026, page: 1 },
      { fy: 2025, page: 1 },
      { fy: 2026, page: 2 },
    ]);
    expect(planYearPages([{ fy: 2026, pagesNeeded: 10 }, { fy: 2025, pagesNeeded: 10 }], 3)).toHaveLength(3);
  });
});

describe("NIH per-year status", () => {
  it("marks sampled years partial and unfetched years not aggregated (null, not 0)", () => {
    const rows = nihYearRows(
      [
        { key: "2025", count: 400, amount: 1000 },
        { key: "2026", count: 10, amount: 50 },
      ],
      new Map([
        [2024, 1800],
        [2025, 1720],
        [2026, 10],
      ]),
      true,
    );
    expect(rows).toEqual([
      { key: "2024", count: null, amount: null, status: "not aggregated", upstreamCount: 1800 },
      { key: "2025", count: 400, amount: 1000, status: "partial", upstreamCount: 1720 },
      { key: "2026", count: 10, amount: 50, status: "complete", upstreamCount: 10 },
    ]);
    expect(nihYearRows([{ key: "2025", count: 3, amount: 9 }], new Map(), false)).toEqual([{ key: "2025", count: 3, amount: 9, status: "complete", upstreamCount: 3 }]);
  });
});
