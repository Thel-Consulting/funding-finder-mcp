import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

async function connect() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("MCP server", () => {
  it("lists exactly the five read-only tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["agency_sbir_summary", "search_nih_awards", "search_nsf_awards", "search_open_opportunities", "similar_funded_projects"].sort(),
    );
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.description).toMatch(/^Read-only\./);
    }
  });

  it("rejects invalid input before calling upstream", async () => {
    const client = await connect();
    const res = (await client.callTool({ name: "search_nsf_awards", arguments: { state: "South Dakota" } })) as { isError?: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/two-letter/);
    const bad = (await client.callTool({ name: "agency_sbir_summary", arguments: { agency: "NIH", fiscal_year_from: 2025, fiscal_year_to: 2020 } })) as { isError?: boolean; content: { text: string }[] };
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/fiscal_year_from/);
  });
});
