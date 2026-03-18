/**
 * ATELIER CMS — Server-side Rate Limiter
 * Lightweight in-memory sliding-window rate limiter for API routes.
 * Resets on server restart — suitable for demo/single-node deployments.
 * For multi-instance production, replace the store with Redis.
 */

interface Window {
  count:     number
  resetAt:   number   // Unix ms
}

const store = new Map<string, Window>()

export interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit:    number
  /** Window duration in ms (default: 60_000 = 1 minute) */
  windowMs: number
}

export interface RateLimitResult {
  ok:         boolean
  remaining:  number
  resetAt:    number
  retryAfter: number   // seconds until reset
}

/**
 * Check and increment the rate limit counter for a given key.
 * Call with `userId:routeId` as key for per-user-per-route isolation.
 */
export function checkRateLimit(
  key:     string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now()
  const win = store.get(key)

  if (!win || now >= win.resetAt) {
    // Start a fresh window
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return { ok: true, remaining: options.limit - 1, resetAt: now + options.windowMs, retryAfter: 0 }
  }

  if (win.count >= options.limit) {
    return {
      ok:         false,
      remaining:  0,
      resetAt:    win.resetAt,
      retryAfter: Math.ceil((win.resetAt - now) / 1000),
    }
  }

  win.count += 1
  return {
    ok:         true,
    remaining:  options.limit - win.count,
    resetAt:    win.resetAt,
    retryAfter: 0,
  }
}

/** Prune expired windows (call periodically or on each check in low-traffic envs). */
export function pruneRateLimitStore(): void {
  const now = Date.now()
  for (const [key, win] of store) {
    if (now >= win.resetAt) store.delete(key)
  }
}
