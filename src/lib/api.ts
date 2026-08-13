/**
 * Shared helpers for the public-facing form endpoints (/api/contact, /api/subscribe).
 * Cheap, in-memory spam defenses sized for an initial public launch — see README
 * for the upgrade path (Vercel KV / Upstash) if traffic ever justifies it.
 */

export interface Limiter {
  (key: string): boolean;
}

/** Sliding-window rate limiter, keyed by client IP. Per serverless instance. */
export function createLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

/** 5 requests / 10 min / IP — plenty for a human, brutal for a script. */
export const contactLimiter = createLimiter(5, 10 * 60 * 1000);
export const subscribeLimiter = createLimiter(5, 10 * 60 * 1000);

export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Honeypot: a hidden `website` field bots love to fill. Humans never see it. */
export function isSpamBot(data: FormData): boolean {
  return ((data.get('website') as string | null) ?? '').trim().length > 0;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
