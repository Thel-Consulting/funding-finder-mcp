export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  check(key: string, now = Date.now()) {
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfter: 0 };
    }
    entry.count++;
    const allowed = entry.count <= this.limit;
    return { allowed, remaining: Math.max(0, this.limit - entry.count), retryAfter: allowed ? 0 : Math.ceil((entry.reset - now) / 1000) };
  }
}

export async function hashKey(value: string, salt: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${value}`));
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
