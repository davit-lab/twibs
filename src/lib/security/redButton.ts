import { z } from 'zod';

export type EmergencyMode =
  | 'online'
  | 'armed'
  | 'backing_up'
  | 'locked_down'
  | 'counter_active'
  | 'recovery';

export type JobStepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'failed';

export interface JobStep {
  key: string;
  status: JobStepStatus;
  pct: number;
  detail: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'rolled_back';

export interface ActiveJob {
  id: string;
  status: JobStatus;
  steps: JobStep[];
  error_detail: string | null;
  created_at: string | null;
  finished_at: string | null;
}

export interface RedButtonStatus {
  mode: EmergencyMode;
  locked_down_until: string | null;
  last_backup_at: string | null;
  blocked_attacks: number;
  threat_count: number;
  firewall_rules_active: boolean;
  active_job: ActiveJob | null;
}

export interface ArmingPayload {
  phrase: string;
  expires_at: string;
}

export interface TriggerResponse {
  job_id: string;
}

export const STEP_ORDER = [
  'dump_db',
  'archive_code',
  'verify_checksums',
  'upload_offsite',
  'flip_flag',
  'apply_firewall',
] as const;

export const STEP_LABELS: Record<string, string> = {
  dump_db: 'Dump database',
  archive_code: 'Archive code',
  verify_checksums: 'Verify checksums',
  upload_offsite: 'Upload offsite backup',
  flip_flag: 'Flip LOCKED_DOWN flag',
  apply_firewall: 'Apply firewall rules',
};

export const MODE_LABELS: Record<EmergencyMode, string> = {
  online: 'ONLINE',
  armed: 'ARMED',
  backing_up: 'BACKING_UP',
  locked_down: 'LOCKED_DOWN',
  counter_active: 'COUNTER_ACTIVE',
  recovery: 'RECOVERY',
};

export const LOCKED_MODES: EmergencyMode[] = ['backing_up', 'locked_down', 'counter_active'];

export function isLocked(mode: EmergencyMode): boolean {
  return LOCKED_MODES.includes(mode);
}

export function isBusy(status: RedButtonStatus): boolean {
  return isLocked(status.mode) || (!!status.active_job && ['queued', 'running'].includes(status.active_job.status));
}

export const MODE_TRANSITIONS: Record<EmergencyMode, EmergencyMode[]> = {
  online: ['armed', 'backing_up', 'recovery'],
  armed: ['online', 'backing_up'],
  backing_up: ['locked_down', 'recovery'],
  locked_down: ['counter_active', 'recovery'],
  counter_active: ['recovery'],
  recovery: ['online'],
};

export function canTransition(from: EmergencyMode, to: EmergencyMode): boolean {
  return MODE_TRANSITIONS[from].includes(to);
}

export function safeTransition(from: EmergencyMode, to: EmergencyMode): EmergencyMode {
  return canTransition(from, to) ? to : from;
}

// Idempotency guard — mirrors the RPC's 409 semantics.
export function triggerRejected(status: RedButtonStatus): string | null {
  if (isLocked(status.mode)) {
    return `Platform is already ${MODE_LABELS[status.mode]}. Roll back before triggering again.`;
  }
  if (status.active_job && ['queued', 'running'].includes(status.active_job.status)) {
    return 'A lockdown job is already running.';
  }
  return null;
}

export interface JobProgress {
  pct: number;
  done: number;
  total: number;
}

export function jobProgress(job: ActiveJob | null): JobProgress {
  if (!job || !job.steps.length) return { pct: 0, done: 0, total: STEP_ORDER.length };
  const total = STEP_ORDER.length;
  const done = STEP_ORDER.filter((key) => {
    const step = job.steps.find((s) => s.key === key);
    return step?.status === 'done';
  }).length;
  const pct = Math.round((done / total) * 100);
  return { pct, done, total };
}

export function stepFor(job: ActiveJob | null, key: string): JobStep | undefined {
  return job?.steps.find((s) => s.key === key);
}

export const redButtonTriggerSchema = z.object({
  pin: z.string().min(4, 'PIN must be at least 4 characters').max(64),
  phrase: z
    .string()
    .regex(/^[A-Z-]+$/, 'Challenge phrase must be uppercase words separated by dashes')
    .min(8, 'Challenge phrase is invalid'),
});

export const armingPayloadSchema = z.object({
  phrase: z.string().min(1),
  // Postgres serializes timestamptz through jsonb with microsecond + offset
  // variants that strict ISO-8601 validation rejects, so accept any string.
  expires_at: z.string(),
});

export const redButtonStatusSchema = z.object({
  mode: z.enum(['online', 'armed', 'backing_up', 'locked_down', 'counter_active', 'recovery']),
  locked_down_until: z.string().nullable(),
  last_backup_at: z.string().nullable(),
  blocked_attacks: z.number(),
  threat_count: z.number(),
  firewall_rules_active: z.boolean(),
  active_job: z
    .object({
      id: z.string(),
      status: z.enum(['queued', 'running', 'done', 'failed', 'rolled_back']),
      steps: z.array(
        z.object({
          key: z.string(),
          status: z.enum(['pending', 'running', 'waiting', 'done', 'failed']),
          pct: z.number(),
          detail: z.string(),
        }),
      ),
      error_detail: z.string().nullable(),
      created_at: z.string().nullable(),
      finished_at: z.string().nullable(),
    })
    .nullable(),
});
