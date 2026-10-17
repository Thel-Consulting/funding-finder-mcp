export interface Cache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class UpstreamError extends Error {
  constructor(
    public source: string,
    public url: string,
    message: string,
    public status?: number,
  ) {
    super(`${source} request failed${status ? ` (HTTP ${status})` : ""}: ${message}. URL: ${url}`);
    this.name = "UpstreamError";
  }

  // 4xx means the upstream rejected this request, not that it is down.
  get isClientError() {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

export class MemoryCache implements Cache {
  private store = new Map<string, { value: string; expires: number }>();
  constructor(private maxEntries = 200) {}
  async get(key: string) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }
  async put(key: string, value: string, ttlSeconds: number) {
    if (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

export interface FetchOptions {
  source: string;
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  cache?: Cache;
  ttlSeconds?: number;
  // Reduces an upstream response to the fields the tools use, dropping
  // anything that echoes the request (search terms, saved-search links) and
  // personal fields. Return undefined to skip caching. Without it, nothing
  // is cached.
  sanitize?: (data: unknown) => unknown;
}

// Cache keys are an HMAC of the upstream request, so key names never contain
// query text and cannot be confirmed by hashing a guessed query. The secret
// comes from the CACHE_KEY_SALT environment variable (set on Netlify, never in
// the repo). Without it each process uses a random secret, which is safe but
// means entries are not shared between function instances.
let hmacKey: Promise<CryptoKey> | undefined;
function cacheHmacKey() {
  hmacKey ??= (async () => {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const secret = env?.CACHE_KEY_SALT || crypto.randomUUID() + crypto.randomUUID();
    return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  })();
  return hmacKey;
}

export const CACHE_KEY_PREFIX = "v2:";

export async function cacheKey(text: string) {
  const sig = await crypto.subtle.sign("HMAC", await cacheHmacKey(), new TextEncoder().encode(text));
  return CACHE_KEY_PREFIX + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function resetCacheKeyForTests() {
  hmacKey = undefined;
}

const USER_AGENT = "funding-finder-mcp/0.1 (open source, Thel Consulting)";

export async function fetchJson<T>(opts: FetchOptions): Promise<T> {
  const { source, url, method = "GET", body, timeoutMs = 25000, ttlSeconds = 3600, sanitize } = opts;
  const cache = sanitize ? opts.cache : undefined;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const key = cache ? await cacheKey(`${method} ${url} ${payload ?? ""}`) : "";
  if (cache) {
    try {
      const hit = await cache.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // cache read failures fall through to upstream
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? (err.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : err.message) : String(err);
    throw new UpstreamError(source, url, msg);
  }
  const text = await res.text();
  if (!res.ok) throw new UpstreamError(source, url, text.slice(0, 200) || res.statusText, res.status);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UpstreamError(source, url, "response was not valid JSON", res.status);
  }
  const clean = sanitize ? sanitize(data) : undefined;
  if (cache && clean !== undefined) {
    try {
      await cache.put(key, JSON.stringify(clean), ttlSeconds);
    } catch {
      // cache write failures are non-fatal
    }
  }
  return (clean ?? data) as T;
}
