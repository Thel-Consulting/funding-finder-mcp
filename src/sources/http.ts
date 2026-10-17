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
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const USER_AGENT = "funding-finder-mcp/0.1 (open source, Thel Consulting)";

export async function fetchJson<T>(opts: FetchOptions): Promise<T> {
  const { source, url, method = "GET", body, timeoutMs = 25000, cache, ttlSeconds = 3600 } = opts;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const key = cache ? `v1:${await sha256(`${method} ${url} ${payload ?? ""}`)}` : "";
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
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(source, url, "response was not valid JSON", res.status);
  }
  if (cache) {
    try {
      await cache.put(key, text, ttlSeconds);
    } catch {
      // cache write failures are non-fatal
    }
  }
  return data;
}
