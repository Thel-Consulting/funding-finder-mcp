import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, SERVER_INFO } from "./server.js";
import type { Cache } from "./sources/http.js";
import { hashKey, RateLimiter } from "./ratelimit.js";

export interface HandlerOptions {
  cache?: Cache;
  ip?: string;
  perMinute?: number;
}

let limiter: RateLimiter | undefined;
let salt: string | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function withCors(res: Response) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return withCors(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));
}

export async function handleMcpRequest(request: Request, opts: HandlerOptions = {}): Promise<Response> {
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
  if (request.method === "GET" && new URL(request.url).searchParams.has("health")) {
    return json(200, { ...SERVER_INFO, status: "ok", readOnly: true });
  }
  if (request.method !== "POST") {
    return json(405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null }, { Allow: "POST" });
  }

  const perMinute = opts.perMinute ?? 60;
  limiter ??= new RateLimiter(perMinute, 60_000);
  salt ??= crypto.randomUUID();
  const verdict = limiter.check(await hashKey(opts.ip ?? "unknown", salt));
  if (!verdict.allowed) {
    return json(
      429,
      { jsonrpc: "2.0", error: { code: -32029, message: `Rate limit exceeded (${perMinute} requests per minute). Retry in ${verdict.retryAfter}s.` }, id: null },
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  const server = createServer(opts.cache);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } finally {
    void transport.close();
    void server.close();
  }
}
