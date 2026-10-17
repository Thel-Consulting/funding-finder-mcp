import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { fail } from "../../src/tools.js";
import { UpstreamError } from "../../src/sources/http.js";

const CANONICAL = "https://grants.thelconsulting.com";
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("release metadata", () => {
  it("uses the canonical URL in mcp.json, manifests and package.json", () => {
    expect(JSON.parse(read("mcp.json")).mcpServers["funding-finder"].url).toBe(`${CANONICAL}/mcp`);
    for (const p of [".cursor-plugin/plugin.json", ".grok-plugin/plugin.json", "package.json"]) {
      const m = JSON.parse(read(p));
      expect(m.homepage, p).toBe(CANONICAL);
      expect(m.keywords, p).toEqual(expect.arrayContaining(["federal-funding-finder", "thel-consulting"]));
    }
    expect(read("scripts/demo.ts")).toContain(`${CANONICAL}/mcp`);
  });

  it("advertises tools without listChanged", async () => {
    const server = createServer();
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    expect(client.getServerCapabilities()?.tools).toEqual({ listChanged: false });
  });

  it("does not blame upstream availability for 4xx errors", () => {
    const text = (e: unknown) => fail(e).content[0].text;
    expect(text(new UpstreamError("NSF", "https://x", "bad request", 400))).toMatch(/rejected the request; check the parameters/);
    expect(text(new UpstreamError("NSF", "https://x", "bad request", 400))).not.toMatch(/may be down/);
    expect(text(new UpstreamError("NSF", "https://x", "server error", 503))).toMatch(/may be down/);
    expect(text(new UpstreamError("NSF", "https://x", "timed out"))).toMatch(/may be down/);
  });
});
