import { describe, it, expect } from 'vitest';
import {
  canTransition,
  safeTransition,
  isLocked,
  triggerRejected,
  jobProgress,
  redButtonTriggerSchema,
} from './redButton';
import type { RedButtonStatus } from './redButton';

const base: RedButtonStatus = {
  mode: 'online',
  locked_down_until: null,
  last_backup_at: null,
  blocked_attacks: 0,
  threat_count: 0,
  firewall_rules_active: false,
  active_job: null,
};

describe('state machine', () => {
  it('allows the canonical trigger chain online -> backing_up -> locked_down -> counter_active', () => {
    expect(canTransition('online', 'backing_up')).toBe(true);
    expect(canTransition('backing_up', 'locked_down')).toBe(true);
    expect(canTransition('locked_down', 'counter_active')).toBe(true);
  });

  it('only exits a lockdown via counter_active or recovery', () => {
    expect(canTransition('locked_down', 'online')).toBe(false);
    expect(canTransition('locked_down', 'recovery')).toBe(true);
    expect(canTransition('counter_active', 'recovery')).toBe(true);
    expect(canTransition('counter_active', 'online')).toBe(false);
  });

  it('recovery returns to online and nothing else', () => {
    expect(canTransition('recovery', 'online')).toBe(true);
    expect(canTransition('recovery', 'armed')).toBe(false);
  });

  it('safeTransition keeps the source when the move is illegal', () => {
    expect(safeTransition('locked_down', 'online')).toBe('locked_down');
    expect(safeTransition('online', 'backing_up')).toBe('backing_up');
  });

  it('classifies locking modes', () => {
    expect(isLocked('backing_up')).toBe(true);
    expect(isLocked('locked_down')).toBe(true);
    expect(isLocked('counter_active')).toBe(true);
    expect(isLocked('online')).toBe(false);
    expect(isLocked('recovery')).toBe(false);
  });
});

describe('idempotency', () => {
  it('rejects a second trigger while locked down', () => {
    expect(triggerRejected({ ...base, mode: 'locked_down' })).toMatch(/already/);
  });

  it('rejects a trigger while a job is queued or running', () => {
    const withJob: RedButtonStatus = {
      ...base,
      active_job: {
        id: 'job-1',
        status: 'running',
        steps: [],
        error_detail: null,
        created_at: null,
        finished_at: null,
      },
    };
    expect(triggerRejected(withJob)).toMatch(/running/);
  });

  it('allows a trigger when online and idle', () => {
    expect(triggerRejected(base)).toBeNull();
  });
});

describe('job progress', () => {
  it('reports 0% with no job', () => {
    expect(jobProgress(null)).toEqual({ pct: 0, done: 0, total: 6 });
  });

  it('counts done steps from real job data', () => {
    const job = {
      id: 'job-1',
      status: 'running' as const,
      error_detail: null,
      created_at: null,
      finished_at: null,
      steps: [
        { key: 'dump_db', status: 'done' as const, pct: 100, detail: '' },
        { key: 'archive_code', status: 'running' as const, pct: 20, detail: '' },
        { key: 'verify_checksums', status: 'pending' as const, pct: 0, detail: '' },
        { key: 'upload_offsite', status: 'pending' as const, pct: 0, detail: '' },
        { key: 'flip_flag', status: 'pending' as const, pct: 0, detail: '' },
        { key: 'apply_firewall', status: 'pending' as const, pct: 0, detail: '' },
      ],
    };
    const { pct, done, total } = jobProgress(job);
    expect(total).toBe(6);
    expect(done).toBe(1);
    expect(pct).toBe(17);
  });
});

describe('trigger body validation', () => {
  it('accepts a valid pin + phrase', () => {
    expect(() => redButtonTriggerSchema.parse({ pin: 'secret123', phrase: 'EMERALD-FALCON-TEMPEST' })).not.toThrow();
  });

  it('rejects a short pin', () => {
    expect(() => redButtonTriggerSchema.parse({ pin: 'ab', phrase: 'EMERALD-FALCON-TEMPEST' })).toThrow();
  });

  it('rejects a malformed phrase', () => {
    expect(() => redButtonTriggerSchema.parse({ pin: 'secret123', phrase: 'emerald falcon' })).toThrow();
  });
});
