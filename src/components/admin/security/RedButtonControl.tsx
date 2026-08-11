import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useRedButton } from '@/hooks/useRedButton';
import {
  ShieldAlert, Loader2, AlertTriangle, Archive, Code2, ShieldCheck, Upload, Flag, Swords,
  CheckCircle2, XCircle, Clock, Trash2, BookOpen, ScrollText, RefreshCcw,
} from 'lucide-react';
import {
  EmergencyMode, JobStep, STEP_LABELS, STEP_ORDER, isBusy, jobProgress, stepFor, triggerRejected,
} from '@/lib/security/redButton';
import { cn } from '@/lib/utils';

const MODE_PILL: Record<EmergencyMode, { label: string; className: string }> = {
  online: { label: 'Online', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  armed: { label: 'Armed', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  backing_up: { label: 'Backing up', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  locked_down: { label: 'Locked down', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  counter_active: { label: 'Countermeasures active', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  recovery: { label: 'Recovery', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
};

const STEP_ICONS: Record<string, React.ElementType> = {
  dump_db: Archive,
  archive_code: Code2,
  verify_checksums: ShieldCheck,
  upload_offsite: Upload,
  flip_flag: Flag,
  apply_firewall: Swords,
};

function StepRow({ step }: { step: JobStep }) {
  const Icon = STEP_ICONS[step.key] ?? ShieldCheck;
  const running = step.status === 'running' || step.status === 'waiting';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-6 flex justify-center">
        {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {step.status === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
        {running && <Loader2 className="w-4 h-4 text-warning animate-spin" />}
        {step.status === 'pending' && <Icon className="w-4 h-4 text-muted-foreground/60" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{STEP_LABELS[step.key] ?? step.key}</p>
        {step.detail && <p className="text-xs text-muted-foreground truncate">{step.detail}</p>}
      </div>
      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            step.status === 'done' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-destructive' : 'bg-warning',
          )}
          style={{ width: `${Math.max(0, Math.min(100, step.pct))}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{step.pct}%</span>
    </div>
  );
}

const STAT_TONES = {
  neutral: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-destructive',
  warning: 'text-warning',
} as const;

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: keyof typeof STAT_TONES }) {
  return (
    <div className="flex-1 min-w-[150px] rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums', STAT_TONES[tone])}>{value}</p>
    </div>
  );
}

export default function RedButtonControl() {
  const navigate = useNavigate();
  const { status, loading, error, refresh, beginArming, trigger, rollback, resume } = useRedButton();

  const [armingOpen, setArmingOpen] = useState(false);
  const [armStep, setArmStep] = useState(1);
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [runbookOpen, setRunbookOpen] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [resuming, setResuming] = useState(false);
  const firedRef = useRef(false);

  const mode: EmergencyMode = status?.mode ?? 'online';
  const pill = MODE_PILL[mode];
  const busy = status ? isBusy(status) : true;
  const armable = !!status && status.mode === 'online' && !status.active_job;
  const progress = jobProgress(status?.active_job ?? null);

  const openArming = useCallback(async () => {
    const { phrase: p, error: err } = await beginArming();
    if (err) {
      toast({ variant: 'destructive', title: 'Failed to arm', description: err });
      return;
    }
    setPhrase(p);
    setAck(false);
    setPin('');
    setArmStep(1);
    setCountdown(3);
    firedRef.current = false;
    setArmingOpen(true);
  }, [beginArming]);

  const fireTrigger = useCallback(async () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setSubmitting(true);
    const { jobId, error: err } = await trigger(pin, phrase ?? '');
    setSubmitting(false);
    if (err) {
      toast({ variant: 'destructive', title: 'Trigger failed', description: err });
      setArmingOpen(false);
      firedRef.current = false;
      return;
    }
    toast({ title: 'Lockdown triggered', description: `Job ${jobId} is running.` });
    setArmingOpen(false);
    firedRef.current = false;
    refresh();
  }, [pin, phrase, trigger, refresh]);

  useEffect(() => {
    if (!armingOpen || armStep !== 3) return;
    if (countdown <= 0) {
      fireTrigger();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [armingOpen, armStep, countdown, fireTrigger]);

  const doRollback = useCallback(async () => {
    setRollingBack(true);
    const { error: err } = await rollback();
    setRollingBack(false);
    setConfirmRollback(false);
    if (err) {
      toast({ variant: 'destructive', title: 'Rollback failed', description: err });
      return;
    }
    toast({ title: 'Rolled back', description: 'Lockdown cleared. Platform is in RECOVERY.' });
    refresh();
  }, [rollback, refresh]);

  const doResume = useCallback(async () => {
    setResuming(true);
    const { error: err } = await resume();
    setResuming(false);
    if (err) {
      toast({ variant: 'destructive', title: 'Resume failed', description: err });
      return;
    }
    toast({ title: 'Platform resumed', description: 'The platform is online again.' });
    refresh();
  }, [resume, refresh]);

  const rejection = status ? triggerRejected(status) : null;

  const modeTone: keyof typeof STAT_TONES =
    mode === 'online'
      ? 'success'
      : mode === 'locked_down' || mode === 'counter_active'
        ? 'danger'
        : 'warning';

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Emergency controls
                <Badge variant="outline" className={cn('border-transparent', pill.className)}>
                  {pill.label}
                </Badge>
              </CardTitle>
              <CardDescription>
                Backup, lockdown and recovery controls for serious platform incidents.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setRunbookOpen((v) => !v)}>
              <BookOpen className="w-4 h-4" /> Runbook
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => navigate('/admin', { state: { openTab: 'audit' } })}
            >
              <ScrollText className="w-4 h-4" /> View audit log
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status stats */}
        <div className="flex flex-wrap gap-3">
          <Stat label="Platform status" value={pill.label} tone={modeTone} />
          <Stat
            label="Last backup"
            value={status?.last_backup_at ? new Date(status.last_backup_at).toLocaleString() : 'Never'}
          />
          <Stat label="Blocked attacks" value={String(status?.blocked_attacks ?? 0)} tone="danger" />
          {status && status.threat_count > 0 && (
            <Stat label="Threat IPs" value={String(status.threat_count)} tone="warning" />
          )}
        </div>

        {/* Poll / auth error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Status unavailable: {error}</span>
          </div>
        )}

        {loading && !status ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-destructive" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Lockdown action</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use only during a confirmed incident. The system creates backups, locks public operations and applies firewall rules.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                This is a production-wide action and requires confirmation before it runs.
              </div>

              <motion.button
                whileTap={armable ? { scale: 0.99 } : undefined}
                disabled={!armable || submitting}
                onClick={openArming}
                title={rejection ?? 'Start emergency lockdown'}
                className={cn(
                  'mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all',
                  'bg-destructive text-destructive-foreground',
                  armable
                    ? 'cursor-pointer hover:bg-destructive/90'
                    : 'cursor-not-allowed opacity-50',
                )}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Start emergency lockdown
              </motion.button>

              <div className="mt-4 space-y-1">
                <p className="text-sm font-medium text-foreground">Current status: {pill.label}</p>
                {busy ? (
                  <p className="text-sm text-muted-foreground">Controls are locked while the emergency workflow is running.</p>
                ) : rejection ? (
                  <p className="text-sm text-muted-foreground">{rejection}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Ready. Review the runbook before starting if this is not time-sensitive.</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {busy && !confirmRollback && (
                  <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmRollback(true)}>
                    <RefreshCcw className="w-4 h-4" /> Rollback
                  </Button>
                )}
                {busy && confirmRollback && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setConfirmRollback(false)} disabled={rollingBack}>
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-2" onClick={doRollback} disabled={rollingBack}>
                      {rollingBack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Confirm rollback
                    </Button>
                  </>
                )}
                {mode === 'recovery' && !busy && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={doResume} disabled={resuming}>
                    {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />} Resume
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    {status?.active_job ? `Workflow ${status.active_job.status}` : 'Emergency workflow'}
                  </p>
                  {status?.active_job && (
                    <span className="text-xs text-muted-foreground tabular-nums">{progress.done}/{progress.total} steps · {progress.pct}%</span>
                  )}
                </div>

                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      status?.active_job?.status === 'failed' ? 'bg-destructive' : 'bg-destructive',
                    )}
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>

                <div className="pt-1">
                  {STEP_ORDER.map((key) => (
                    <StepRow key={key} step={stepFor(status?.active_job ?? null, key) ?? { key, status: 'pending', pct: 0, detail: '' }} />
                  ))}
                </div>

                {status?.active_job?.status === 'failed' && status.active_job.error_detail && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Workflow failed: {status.active_job.error_detail}. The platform moved to recovery and the alert webhook was fired.</span>
                  </div>
                )}

                {mode === 'recovery' && !status?.active_job && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>The platform is in recovery. Review the audit log, then resume operations.</span>
                  </div>
                )}
              </div>

              {/* Runbook */}
              {runbookOpen && (
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-1.5">
                  <p className="font-semibold text-foreground">Runbook</p>
                  <p>1. Confirm the incident with at least one other on-call admin.</p>
                  <p>2. Add known attacker IPs under threat tracking, then start emergency lockdown.</p>
                  <p>3. The workflow backs up the database, archives code, verifies checksums, uploads offsite, locks the platform, and applies firewall rules.</p>
                  <p>4. Export the data archive and monitor blocked-attack counters.</p>
                  <p>5. When the threat is contained, press Rollback, then Resume.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Arming modal */}
      <AnimatePresence>
        {armingOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setArmingOpen(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-bold">Start emergency lockdown — Step {armStep} of 3</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                This locks the platform down. Impossible-to-miss confirmation required.
              </p>

              <AnimatePresence mode="wait">
                {armStep === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="space-y-4"
                  >
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
                      Triggering will immediately: snapshot the database, archive the codebase, upload an offsite backup,
                      lock the platform, and apply firewall rules against all threat IPs.
                      This is a production-wide action.
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
                      <span className="text-sm">I understand this is a production-wide emergency action.</span>
                      <Switch checked={ack} onCheckedChange={setAck} />
                    </label>
                  </motion.div>
                )}

                {armStep === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label>Session challenge phrase</Label>
                      <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                        <p className="font-mono text-lg font-bold tracking-wider text-foreground">{phrase ?? '…'}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> Expires in 2 minutes.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="red-pin">Admin PIN</Label>
                      <Input
                        id="red-pin"
                        type="password"
                        autoComplete="off"
                        placeholder="Enter your admin PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                      />
                    </div>
                    {!phrase && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Challenge phrase unavailable — cancel and start again.
                      </p>
                    )}
                  </motion.div>
                )}

                {armStep === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-8 flex flex-col items-center gap-2"
                  >
                    <motion.p
                      key={countdown}
                      initial={{ scale: 1.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-7xl font-black text-destructive tabular-nums"
                    >
                      {countdown}
                    </motion.p>
                    <p className="text-sm text-muted-foreground">Starting emergency lockdown…</p>
                    {submitting && <Loader2 className="w-5 h-5 animate-spin text-destructive" />}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArmingOpen(false)}
                  disabled={armStep === 3 && !submitting && countdown <= 0}
                >
                  Cancel
                </Button>
                {armStep === 1 && (
                  <Button variant="destructive" size="sm" disabled={!ack} onClick={() => setArmStep(2)}>
                    Continue
                  </Button>
                )}
                {armStep === 2 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!phrase || pin.length < 4}
                    onClick={() => setArmStep(3)}
                  >
                    Begin countdown
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
