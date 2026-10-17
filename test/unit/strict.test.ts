import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

type Result = { isError?: boolean; content: { text: string }[] };

async function connect() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("strict input schemas", () => {
  it("every tool rejects unknown parameters and lists the valid ones", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
    for (const t of tools) {
      const props = Object.keys(t.inputSchema.properties ?? {});
      expect(props.length).toBeGreaterThan(0);
      expect(t.inputSchema.additionalProperties).toBe(false);
      const res = (await client.callTool({ name: t.name, arguments: { bogus_param: 1 } })) as Result;
      expect(res.isError, t.name).toBe(true);
      const text = res.content[0].text;
      expect(text).toContain("Unknown parameter(s): bogus_param");
      for (const p of props) expect(text).toContain(p);
    }
  });

  it("search_nih_awards with guessed names errors instead of searching nationally", async () => {
    const client = await connect();
    const res = (await client.callTool({ name: "search_nih_awards", arguments: { state: "SD", fiscalYearFrom: 2020 } })) as Result;
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown parameter\(s\): state, fiscalYearFrom/);
    expect(res.content[0].text).toContain("org_states");
  });
});
