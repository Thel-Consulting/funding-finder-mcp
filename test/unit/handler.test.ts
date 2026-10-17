import { describe, expect, it } from "vitest";
import { handleMcpRequest, originAllowed } from "../../src/handler.js";

const listTools = (origin?: string) =>
  new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("HTTP handler", () => {
  it("serves tools/list over streamable HTTP with no Origin header", async () => {
    const res = await handleMcpRequest(listTools(), { ip: "198.51.100.1", perMinute: 100 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools).toHaveLength(5);
  });

  it("rejects GET with 405 and answers OPTIONS", async () => {
    const get = await handleMcpRequest(new Request("http://localhost/mcp"));
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST, OPTIONS");
    expect((await handleMcpRequest(new Request("http://localhost/mcp", { method: "OPTIONS" }))).status).toBe(204);
  });

  it("validates Origin", async () => {
    const ok = await handleMcpRequest(listTools("https://grants.thelconsulting.com"), { ip: "198.51.100.4", perMinute: 100 });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://grants.thelconsulting.com");
    expect(ok.headers.get("Vary")).toBe("Origin");
    const evil = await handleMcpRequest(listTools("https://evil.example"), { ip: "198.51.100.4", perMinute: 100 });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const preflight = await handleMcpRequest(new Request("http://localhost/mcp", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }));
    expect(preflight.status).toBe(403);
    const extra = await handleMcpRequest(listTools("https://app.example"), { ip: "198.51.100.4", perMinute: 100, allowedOrigins: ["https://app.example"] });
    expect(extra.status).toBe(200);
  });

  it("originAllowed rules", () => {
    expect(originAllowed(null)).toBe(true);
    expect(originAllowed("https://federal-funding-finder.netlify.app")).toBe(true);
    expect(originAllowed("http://localhost:6274")).toBe(true);
    expect(originAllowed("http://127.0.0.1:8888")).toBe(true);
    expect(originAllowed("vscode-file://vscode-app")).toBe(true);
    expect(originAllowed("https://grants.thelconsulting.com.evil.example")).toBe(false);
    expect(originAllowed("http://grants.thelconsulting.com")).toBe(false);
    expect(originAllowed("null")).toBe(false);
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
