// Single source of truth for the verification state -> (icon, title, hint)
// copy shown to the admin. Reasons are intentionally generic; specifics stay
// server-side.

import { AlertTriangle, CameraOff, CheckCircle2, Loader2, ScanFace, ShieldCheck, Users, XCircle } from 'lucide-react';
import type { VerificationState } from './types';
import { cn } from '@/lib/utils';

interface VerificationStatusProps {
  state: VerificationState;
  className?: string;
}

interface StatusCopy {
  icon: React.ElementType;
  title: string;
  hint: string;
  tone: 'default' | 'warn' | 'danger' | 'success';
  spinner?: boolean;
}

const COPY: Record<VerificationState, StatusCopy> = {
  idle: { icon: ScanFace, title: 'Face verification', hint: 'We need to confirm it is really you before continuing.', tone: 'default' },
  camera_initializing: { icon: Loader2, title: 'Starting camera…', hint: 'Waiting for camera access.', tone: 'default', spinner: true },
  camera_permission_required: { icon: CameraOff, title: 'Camera access needed', hint: 'Allow camera access in your browser to continue.', tone: 'warn' },
  camera_error: { icon: CameraOff, title: 'Camera unavailable', hint: 'No camera was found or it could not be started.', tone: 'danger' },
  detecting_face: { icon: Loader2, title: 'Finding your face…', hint: 'Center your face in the frame and keep still.', tone: 'default', spinner: true },
  multiple_faces: { icon: Users, title: 'Multiple faces detected', hint: 'Make sure only you are in the frame.', tone: 'warn' },
  camera_ready: { icon: Loader2, title: 'Face locked in', hint: 'Starting the liveness check…', tone: 'default', spinner: true },
  liveness_starting: { icon: Loader2, title: 'Preparing check…', hint: 'A few random prompts are coming up.', tone: 'default', spinner: true },
  liveness_in_progress: { icon: ScanFace, title: 'Follow the prompts', hint: 'Follow each on-screen instruction as it appears.', tone: 'default' },
  liveness_failed: { icon: AlertTriangle, title: 'Liveness check failed', hint: 'Something went wrong. Please try again.', tone: 'danger' },
  liveness_success: { icon: CheckCircle2, title: 'Liveness confirmed', hint: 'Great — verifying identity…', tone: 'success' },
  face_matching: { icon: Loader2, title: 'Verifying identity…', hint: 'Comparing your face against the registered template.', tone: 'default', spinner: true },
  face_match_failed: { icon: XCircle, title: 'Verification failed', hint: 'We could not confirm your identity. Please try again.', tone: 'danger' },
  authentication_success: { icon: ShieldCheck, title: 'Verified', hint: 'Access granted.', tone: 'success' },
  authentication_failed: { icon: XCircle, title: 'Verification failed', hint: 'We could not confirm your identity. Please try again.', tone: 'danger' },
  too_many_attempts: { icon: AlertTriangle, title: 'Too many attempts', hint: 'Please wait a moment before trying again.', tone: 'danger' },
};

export default function VerificationStatus({ state, className }: VerificationStatusProps) {
  const copy = COPY[state];
  const Icon = copy.icon;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-5 py-4',
        copy.tone === 'danger' && 'border-destructive/40 bg-destructive/5 text-destructive',
        copy.tone === 'warn' && 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400',
        copy.tone === 'success' && 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
        copy.tone === 'default' && 'border-border/60 bg-card/60',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', copy.spinner && 'animate-spin')} />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{copy.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.hint}</p>
      </div>
    </div>
  );
}
