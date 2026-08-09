import { describe, it, expect } from 'vitest';
import { RED_BUTTON_POLICY, SlidingWindowRateLimiter } from './rateLimit';

describe('SlidingWindowRateLimiter', () => {
  it('allows a first request with no retry-after', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    const first = rl.tryAcquire('admin:1', 1_000);
    expect(first.ok).toBe(true);
    expect(first.retryAfterMs).toBe(0);
  });

  it('blocks once the 1/minute burst cap is hit', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    expect(rl.tryAcquire('admin:1', 1_000).ok).toBe(true);
    const second = rl.tryAcquire('admin:1', 2_000);
    expect(second.ok).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it('enforces the 3/hour cap across distinct minutes', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    expect(rl.tryAcquire('admin:1', 1_000).ok).toBe(true);
    expect(rl.tryAcquire('admin:1', 61_000).ok).toBe(true);
    expect(rl.tryAcquire('admin:1', 121_000).ok).toBe(true);
    expect(rl.tryAcquire('admin:1', 181_000).ok).toBe(false);
  });

  it('expires hits after the window closes', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    rl.tryAcquire('admin:1', 1_000);
    rl.tryAcquire('admin:1', 2_000);
    // More than an hour later both hits have aged out.
    expect(rl.tryAcquire('admin:1', 3_700_000).ok).toBe(true);
  });

  it('keeps keys independent', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    rl.tryAcquire('admin:1', 1_000);
    rl.tryAcquire('admin:1', 2_000);
    expect(rl.tryAcquire('admin:2', 3_000).ok).toBe(true);
  });

  it('reset clears all history', () => {
    const rl = new SlidingWindowRateLimiter(RED_BUTTON_POLICY);
    rl.tryAcquire('admin:1', 1_000);
    rl.tryAcquire('admin:1', 2_000);
    rl.reset();
    expect(rl.tryAcquire('admin:1', 3_000).ok).toBe(true);
  });

  it('requires at least one window', () => {
    expect(() => new SlidingWindowRateLimiter([])).toThrow();
  });
});
