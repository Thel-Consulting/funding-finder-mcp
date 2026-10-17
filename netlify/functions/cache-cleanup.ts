import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { CACHE_STORE, cleanupCache, type BlobStore } from "../../src/blobs-cache.js";

// Hourly: delete expired cache entries and entries in an old key format.
export default async () => {
  const result = await cleanupCache(getStore({ name: CACHE_STORE }) as unknown as BlobStore);
  console.log(JSON.stringify({ event: "cache-cleanup", ...result }));
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "@hourly" };
