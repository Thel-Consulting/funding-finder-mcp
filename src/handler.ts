import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, SERVER_INFO } from "./server.js";
import type { Cache } from "./sources/http.js";
import { hashKey, RateLimiter } from "./ratelimit.js";

export interface HandlerOptions {
  cache?: Cache;
  ip?: string;
  perMinute?: number;
  // Extra browser origins to allow, for example from ALLOWED_ORIGINS.
  allowedOrigins?: string[];
}

export const CANONICAL_ORIGINS = ["https://grants.thelconsulting.com", "https://federal-funding-finder.netlify.app"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Origin check (MCP Streamable HTTP: servers must validate Origin to stop DNS
// rebinding). Rules:
// - No Origin header: allowed. Cursor, Grok Bot, the Inspector CLI and other
//   server-side or desktop clients send none.
// - http(s) origins: allowed only for this site's own domains, localhost (for
//   local tools such as the Inspector web UI) and ALLOWED_ORIGINS.
// - Non-web schemes (vscode-file://, app://): allowed, since they are local
//   apps rather than web pages.
// - Anything else, including the literal "null": rejected.
export function originAllowed(origin: string | null, extra: string[] = []) {
  if (origin === null || origin === "") return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return true;
  if (LOCAL_HOSTS.has(url.hostname)) return true;
  return [...CANONICAL_ORIGINS, ...extra].includes(url.origin);
}

let limiter: RateLimiter | undefined;
let salt: string | undefined;

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Method, Mcp-Name",
    Vary: "Origin",
  };
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function withCors(res: Response, origin: string | null) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

function json(status: number, body: unknown, origin: string | null, headers: Record<string, string> = {}) {
  return withCors(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }), origin);
}

export async function handleMcpRequest(request: Request, opts: HandlerOptions = {}): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, opts.allowedOrigins)) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: `Origin not allowed: ${origin}` }, id: null }),
      { status: 403, headers: { "Content-Type": "application/json", Vary: "Origin" } },
    );
  }
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), origin);
  if (request.method === "GET" && new URL(request.url).searchParams.has("health")) {
    return json(200, { ...SERVER_INFO, status: "ok", readOnly: true }, origin);
  }
  if (request.method !== "POST") {
    return json(405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null }, origin, {
      Allow: "POST, OPTIONS",
    });
  }

  const perMinute = opts.perMinute ?? 60;
  limiter ??= new RateLimiter(perMinute, 60_000);
  salt ??= crypto.randomUUID();
  const verdict = limiter.check(await hashKey(opts.ip ?? "unknown", salt));
  if (!verdict.allowed) {
    return json(
      429,
      { jsonrpc: "2.0", error: { code: -32029, message: `Rate limit exceeded (${perMinute} requests per minute). Retry in ${verdict.retryAfter}s.` }, id: null },
      origin,
      { "Retry-After": String(verdict.retryAfter) },
    );
  }

  const server = createServer(opts.cache);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request), origin);
  } finally {
    void transport.close();
    void server.close();
  }
}
