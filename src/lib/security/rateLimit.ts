export interface RateLimitWindow {
  max: number;
  windowMs: number;
}

export interface AcquireResult {
  ok: boolean;
  retryAfterMs: number;
  windowMs: number;
}

/**
 * Sliding-window rate limiter. Pure, injectable clock — mirrors the
 * Postgres implementation used by emergency_check_rate_limit() so the
 * exact policy (3/hour + 1/minute) is unit-testable client-side.
 */
export class SlidingWindowRateLimiter {
  private history = new Map<string, number[]>();

  constructor(private readonly windows: RateLimitWindow[]) {
    if (!windows.length) throw new Error('at least one rate limit window is required');
  }

  private prune(key: string, now: number): number[] {
    const keepFor = Math.max(...this.windows.map((w) => w.windowMs));
    const arr = (this.history.get(key) ?? []).filter((t) => now - t < keepFor);
    this.history.set(key, arr);
    return arr;
  }

  tryAcquire(key: string, now: number = Date.now()): AcquireResult {
    const arr = this.prune(key, now);

    for (const w of this.windows) {
      const recent = arr.filter((t) => now - t < w.windowMs);
      if (recent.length >= w.max) {
        const oldest = recent[0];
        return { ok: false, retryAfterMs: Math.max(1, oldest + w.windowMs - now), windowMs: w.windowMs };
      }
    }

    arr.push(now);
    return { ok: true, retryAfterMs: 0, windowMs: 0 };
  }

  reset(key?: string): void {
    if (key) this.history.delete(key);
    else this.history.clear();
  }
}

export const RED_BUTTON_POLICY: RateLimitWindow[] = [
  { max: 1, windowMs: 60_000 }, // 1 trigger per minute burst
  { max: 3, windowMs: 3_600_000 }, // 3 triggers per hour
];
