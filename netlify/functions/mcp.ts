import type { Config, Context } from "@netlify/functions";
import { BlobsCache } from "../../src/blobs-cache.js";
import { handleMcpRequest } from "../../src/handler.js";
import { MemoryCache, type Cache } from "../../src/sources/http.js";

const memory = new MemoryCache(100);
let cache: Cache | undefined;

function getCache(): Cache {
  if (cache) return cache;
  try {
    cache = new BlobsCache();
  } catch {
    cache = memory;
  }
  return cache;
}

export default async (request: Request, context: Context) =>
  handleMcpRequest(request, {
    cache: getCache(),
    ip: context.ip,
    perMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? "60") || 60,
  });

export const config: Config = { path: "/mcp" };
