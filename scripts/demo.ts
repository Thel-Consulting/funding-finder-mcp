import { writeFileSync, mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? process.env.MCP_URL ?? "https://grants.thelconsulting.com/mcp";

const prompts = [
  { prompt: "NIH SBIR awards to South Dakota companies since 2020", tool: "search_nih_awards", args: { org_states: ["SD"], fiscal_year_from: 2020, limit: 50 } },
  { prompt: "Open Grants.gov opportunities for keyword SBIR", tool: "search_open_opportunities", args: { keyword: "SBIR", rows: 10 } },
  { prompt: "NSF SBIR/STTR awards in South Dakota", tool: "search_nsf_awards", args: { state: "SD", sbir_sttr_only: true, rows: 25 } },
  { prompt: "Similar funded projects: biofilm wound dressing", tool: "similar_funded_projects", args: { description: "biofilm wound dressing", limit: 10 } },
  { prompt: "NIH SBIR/STTR summary for South Dakota", tool: "agency_sbir_summary", args: { agency: "NIH", state: "SD", fiscal_year_from: 2016 } },
  { prompt: "Timing check: NSF SBIR/STTR summary for South Dakota", tool: "agency_sbir_summary", args: { agency: "NSF", state: "SD", fiscal_year_from: 2016 } },
  { prompt: "Timing check: NSF SBIR/STTR summary, all states, last 5 fiscal years", tool: "agency_sbir_summary", args: { agency: "NSF" } },
  { prompt: "Timing check: NIH SBIR/STTR summary, all states, FY2025", tool: "agency_sbir_summary", args: { agency: "NIH", fiscal_year_from: 2025, fiscal_year_to: 2025 } },
];

const client = new Client({ name: "funding-finder-demo", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const tools = await client.listTools();
console.log(`Connected to ${url}. Tools: ${tools.tools.map((t) => t.name).join(", ")}\n`);

const results: unknown[] = [];
let failures = 0;
for (const p of prompts) {
  const started = Date.now();
  const res = (await client.callTool({ name: p.tool, arguments: p.args })) as { isError?: boolean; content: { type: string; text: string }[] };
  const text = res.content.map((c) => c.text).join("\n");
  const ms = Date.now() - started;
  if (res.isError) failures++;
  console.log(`## ${p.prompt}\n${p.tool} ${JSON.stringify(p.args)} (${ms} ms)${res.isError ? " ERROR" : ""}`);
  console.log(text.split("\n")[0]);
  const body = text.indexOf("{");
  if (!res.isError && body >= 0) {
    const data = JSON.parse(text.slice(body));
    const rows = (data.results ?? []) as Record<string, unknown>[];
    for (const r of rows.slice(0, 3)) {
      const amount = r.awardAmount ?? r.fundsObligated;
      console.log(`  - ${r.title} | ${r.organization ?? r.agency ?? ""} | ${amount != null ? `$${Number(amount).toLocaleString("en-US")}` : r.closeDate ? `closes ${r.closeDate}` : r.status ?? ""} | ${r.url}`);
    }
    if (data.byFiscalYear) {
      type Year = { key: string; count: number | null; amount: number | null; status?: string; upstreamCount?: number | null };
      const fmt = (b: Year) =>
        b.status === "not aggregated"
          ? `${b.key}: not aggregated (${b.upstreamCount ?? "?"} upstream)`
          : `${b.key}: ${b.count}${b.status === "partial" ? ` (sample; ${b.upstreamCount ?? "?"} upstream)` : ""} / $${(b.amount ?? 0).toLocaleString("en-US")}`;
      console.log(`  by fiscal year: ${data.byFiscalYear.map(fmt).join("; ")}`);
    }
    if (data.excludedNonCompany?.count) console.log(`  excluded non-company awards: ${data.excludedNonCompany.count} (${data.excludedNonCompany.byProgram.map((p: { key: string; count: number }) => `${p.key}: ${p.count}`).join("; ")})`);
    if (data.partialNote) console.log(`  ${data.partialNote}`);
    if (data.topOrganizations) console.log(`  top orgs: ${data.topOrganizations.slice(0, 3).map((o: { key: string; amount: number }) => `${o.key} ($${o.amount.toLocaleString("en-US")})`).join("; ")}`);
  } else if (res.isError) {
    console.log(`  ${text}`);
  }
  console.log("");
  results.push({ prompt: p.prompt, tool: p.tool, args: p.args, ms, isError: !!res.isError, response: text });
}
await client.close();

mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/demo-output.json", JSON.stringify({ url, ranAt: new Date().toISOString(), results }, null, 2));
console.log(`Raw responses saved to artifacts/demo-output.json. ${failures} of ${prompts.length} calls returned errors.`);
process.exit(failures ? 1 : 0);
