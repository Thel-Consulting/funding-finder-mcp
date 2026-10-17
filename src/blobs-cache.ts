import { getStore } from "@netlify/blobs";
import { CACHE_KEY_PREFIX, type Cache } from "./sources/http.js";

export const CACHE_STORE = "upstream-cache";

// The subset of the Netlify Blobs store API this module uses.
export interface BlobStore {
  getWithMetadata(key: string, opts: { type: "text" }): Promise<{ data: string; metadata: Record<string, unknown> } | null>;
  getMetadata(key: string): Promise<{ metadata: Record<string, unknown> } | null>;
  set(key: string, value: string, opts: { metadata: Record<string, unknown> }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(opts: { paginate: true }): AsyncIterable<{ blobs: { key: string }[] }>;
}

function expiresOf(metadata: Record<string, unknown> | undefined) {
  return Number(metadata?.expires ?? 0);
}

export class BlobsCache implements Cache {
  constructor(private store: BlobStore = getStore({ name: CACHE_STORE }) as unknown as BlobStore) {}

  // TTL is enforced here: an expired entry is never returned, and is deleted.
  async get(key: string) {
    const hit = await this.store.getWithMetadata(key, { type: "text" });
    if (!hit) return null;
    if (expiresOf(hit.metadata) <= Date.now()) {
      await this.store.delete(key).catch(() => undefined);
      return null;
    }
    return hit.data;
  }

  async put(key: string, value: string, ttlSeconds: number) {
    await this.store.set(key, value, { metadata: { expires: Date.now() + ttlSeconds * 1000 } });
  }
}

// Deletes expired entries and entries written under an older key format.
// With all = true, deletes every entry.
export async function cleanupCache(store: BlobStore, opts: { now?: number; all?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  let scanned = 0;
  let deleted = 0;
  for await (const page of store.list({ paginate: true })) {
    for (const { key } of page.blobs) {
      scanned++;
      let remove = opts.all || !key.startsWith(CACHE_KEY_PREFIX);
      if (!remove) {
        const meta = await store.getMetadata(key);
        remove = !meta || expiresOf(meta.metadata) <= now;
      }
      if (remove) {
        await store.delete(key);
        deleted++;
      }
    }
  }
  return { scanned, deleted };
}
