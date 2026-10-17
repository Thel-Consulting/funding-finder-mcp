import { getStore } from "@netlify/blobs";
import type { Cache } from "./sources/http.js";

export class BlobsCache implements Cache {
  private store = getStore({ name: "upstream-cache" });

  async get(key: string) {
    const hit = await this.store.getWithMetadata(key, { type: "text" });
    if (!hit) return null;
    const expires = Number((hit.metadata as { expires?: number }).expires ?? 0);
    if (expires < Date.now()) {
      void this.store.delete(key).catch(() => undefined);
      return null;
    }
    return hit.data;
  }

  async put(key: string, value: string, ttlSeconds: number) {
    await this.store.set(key, value, { metadata: { expires: Date.now() + ttlSeconds * 1000 } });
  }
}
