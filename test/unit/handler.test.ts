import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "../../src/handler.js";

const listTools = () =>
  new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("HTTP handler", () => {
  it("serves tools/list over streamable HTTP", async () => {
    const res = await handleMcpRequest(listTools(), { ip: "198.51.100.1", perMinute: 100 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools).toHaveLength(5);
  });

  it("rejects GET with 405 and answers OPTIONS", async () => {
    expect((await handleMcpRequest(new Request("http://localhost/mcp"))).status).toBe(405);
    expect((await handleMcpRequest(new Request("http://localhost/mcp", { method: "OPTIONS" }))).status).toBe(204);
  });

  it("rate limits per IP with 429 and Retry-After", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 101; i++) last = await handleMcpRequest(listTools(), { ip: "198.51.100.2", perMinute: 100 });
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("Retry-After"))).toBeGreaterThan(0);
    const other = await handleMcpRequest(listTools(), { ip: "198.51.100.3", perMinute: 100 });
    expect(other.status).toBe(200);
  });
});
