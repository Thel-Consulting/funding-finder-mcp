import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGrantsResponse, sanitizeGrantsResponse } from "../../src/sources/grants.js";
import { parseNihProject, sanitizeNihResponse } from "../../src/sources/nih.js";
import { parseNsfResponse, sanitizeNsfResponse } from "../../src/sources/nsf.js";
import { cacheKey, fetchJson, MemoryCache, resetCacheKeyForTests } from "../../src/sources/http.js";
import { BlobsCache, cleanupCache, type BlobStore } from "../../src/blobs-cache.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("cache sanitizers", () => {
  it("Grants.gov: drops searchParams, keeps what the parser uses", () => {
    const raw = fixture("grants-search2.json");
    const clean = sanitizeGrantsResponse(raw)!;
    expect(JSON.stringify(clean)).not.toContain("searchParams");
    expect(parseGrantsResponse(clean as never)).toEqual(parseGrantsResponse(raw));
    expect(sanitizeGrantsResponse({ errorcode: 1, msg: "bad" })).toBeUndefined();
  });

  it("NIH: drops search_id and the saved-search URL, keeps parsed fields", () => {
    const raw = fixture("nih-search.json");
    const clean = sanitizeNihResponse(raw)!;
    const text = JSON.stringify(clean);
    expect(text).not.toContain("search_id");
    expect(text).not.toContain("reporter.nih.gov/search");
    expect(clean.meta).toEqual({ total: raw.meta.total, offset: raw.meta.offset, limit: raw.meta.limit });
    const parse = (r: { results: unknown[] }) => r.results.map((p) => parseNihProject(p as Parameters<typeof parseNihProject>[0], true));
    expect(parse(clean)).toEqual(parse(raw));
    expect(clean.results[0]).toHaveProperty("core_project_num");
  });

  it("NSF: drops PI and program officer contact fields", () => {
    const raw = fixture("nsf-awards.json") as { response: { award: Record<string, unknown>[] } };
    Object.assign(raw.response.award[0], { piFirstName: "Pat", piLastName: "Doe", piEmail: "pi@example.org", poName: "Lee", poEmail: "po@example.org", poPhone: "555" });
    const clean = sanitizeNsfResponse(raw)!;
    expect(JSON.stringify(clean)).not.toMatch(/piFirstName|piEmail|poName|poEmail|poPhone|@example\.org/);
    expect(parseNsfResponse(clean as never, true)).toEqual(parseNsfResponse(raw as never, true));
    expect(sanitizeNsfResponse({ response: { serviceNotification: [{ notificationType: "ERROR" }] } })).toBeUndefined();
  });
});

describe("fetchJson cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CACHE_KEY_SALT;
    resetCacheKeyForTests();
  });

  it("stores only sanitized data under an HMAC key with no query text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ echo: "secret topic", keep: 1 }), { status: 200 })));
    const puts: [string, string][] = [];
    const cache = { get: async () => null, put: async (k: string, v: string) => void puts.push([k, v]) };
    const out = await fetchJson<{ keep: number }>({
      source: "test",
      url: "https://example.test/search?q=secret+topic",
      method: "POST",
      body: { keyword: "secret topic" },
      cache,
      sanitize: (d) => ({ keep: (d as { keep: number }).keep }),
    });
    expect(out).toEqual({ keep: 1 });
    expect(puts).toHaveLength(1);
    expect(puts[0][0]).toMatch(/^v2:[0-9a-f]{64}$/);
    expect(puts[0].join(" ")).not.toContain("secret");
  });

  it("does not cache without a sanitizer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const cache = new MemoryCache(10);
    const put = vi.spyOn(cache, "put");
    await fetchJson({ source: "test", url: "https://example.test/", cache });
    expect(put).not.toHaveBeenCalled();
  });

  it("keys depend on the secret salt", async () => {
    process.env.CACHE_KEY_SALT = "salt-a";
    resetCacheKeyForTests();
    const a = await cacheKey("GET https://example.test/?q=x");
    expect(await cacheKey("GET https://example.test/?q=x")).toBe(a);
    process.env.CACHE_KEY_SALT = "salt-b";
    resetCacheKeyForTests();
    expect(await cacheKey("GET https://example.test/?q=x")).not.toBe(a);
  });
});

function fakeStore(entries: Record<string, { data: string; expires?: number }>) {
  const map = new Map(Object.entries(entries));
  const store: BlobStore = {
    async getWithMetadata(key) {
      const e = map.get(key);
      return e ? { data: e.data, metadata: e.expires === undefined ? {} : { expires: e.expires } } : null;
    },
    async getMetadata(key) {
      const e = map.get(key);
      return e ? { metadata: e.expires === undefined ? {} : { expires: e.expires } } : null;
    },
    async set(key, data, { metadata }) {
      map.set(key, { data, expires: metadata.expires as number });
    },
    async delete(key) {
      map.delete(key);
    },
    async *list() {
      yield { blobs: [...map.keys()].map((key) => ({ key })) };
    },
  };
  return { store, map };
}

describe("Blobs cache expiry", () => {
  it("never returns an expired entry and deletes it on read", async () => {
    const { store, map } = fakeStore({ "v2:old": { data: "x", expires: Date.now() - 1 }, "v2:new": { data: "y", expires: Date.now() + 60_000 } });
    const cache = new BlobsCache(store);
    expect(await cache.get("v2:old")).toBeNull();
    expect(map.has("v2:old")).toBe(false);
    expect(await cache.get("v2:new")).toBe("y");
  });

  it("cleanup deletes expired, legacy and metadata-less entries", async () => {
    const now = Date.now();
    const { store, map } = fakeStore({
      "v2:fresh": { data: "a", expires: now + 60_000 },
      "v2:expired": { data: "b", expires: now - 1 },
      "v2:nometa": { data: "c" },
      "v1:legacy": { data: "d", expires: now + 60_000 },
    });
    expect(await cleanupCache(store, { now })).toEqual({ scanned: 4, deleted: 3 });
    expect([...map.keys()]).toEqual(["v2:fresh"]);
    expect(await cleanupCache(store, { all: true })).toEqual({ scanned: 1, deleted: 1 });
  });
});
