// A simple limit on how often one address can call a public web address, such as the call
// recording tool address or unsubscribe links. Kept in memory, which suits one server; Nginx adds
// its own limits in front (see deploy/nginx.conf).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, retryAfterSeconds: 0 };
  }
  b.count++;
  return b.count <= limit ? { ok: true, retryAfterSeconds: 0 } : { ok: false, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
}

/** The visitor's address, as passed on by Nginx. */
export function clientAddress(headers: Headers) {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function tooMany(retryAfterSeconds: number) {
  return new Response("Too many requests. Please wait a moment and try again.", { status: 429, headers: { "retry-after": String(retryAfterSeconds) } });
}
