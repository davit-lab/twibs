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
  CheckCircle2, XCircle, Clock, Trash2, BookOpen, ScrollText, RefreshCcw, Radar,
} from 'lucide-react';
import {
  EmergencyMode, JobStep, MODE_LABELS, STEP_LABELS, STEP_ORDER, isBusy, jobProgress, stepFor, triggerRejected,
} from '@/lib/security/redButton';
import { cn } from '@/lib/utils';

const MODE_PILL: Record<EmergencyMode, { label: string; className: string }> = {
  online: { label: 'ONLINE', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  armed: { label: 'ARMED', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  backing_up: { label: 'BACKING_UP', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  locked_down: { label: 'LOCKED_DOWN', className: 'bg-rose-500/15 text-rose-400 border-rose-500/40' },
  counter_active: { label: 'COUNTER_ACTIVE', className: 'bg-violet-500/15 text-violet-400 border-violet-500/40' },
  recovery: { label: 'RECOVERY', className: 'bg-orange-500/15 text-orange-400 border-orange-500/40' },
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
        {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {step.status === 'failed' && <XCircle className="w-4 h-4 text-rose-500" />}
        {running && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
        {step.status === 'pending' && <Icon className="w-4 h-4 text-muted-foreground/60" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{STEP_LABELS[step.key] ?? step.key}</p>
        {step.detail && <p className="text-xs text-muted-foreground truncate">{step.detail}</p>}
      </div>
      <div className="w-24 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            step.status === 'done' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500',
          )}
          style={{ width: `${Math.max(0, Math.min(100, step.pct))}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-muted-foreground">{step.pct}%</span>
    </div>
  );
}

function Pill({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-neutral-900/60 px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Badge variant="outline" className={cn('gap-1.5', className)}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        {value}
      </Badge>
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
  const [phraseEntry, setPhraseEntry] = useState('');
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
    setPhraseEntry('');
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
    toast({ title: 'Platform resumed', description: 'SYSTEM ONLINE.' });
    refresh();
  }, [resume, refresh]);

  const rejection = status ? triggerRejected(status) : null;

  return (
    <Card className="border-rose-500/25 bg-neutral-950/60 overflow-hidden">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-[0_0_25px_rgba(244,63,94,0.5)]">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Red Button
                <Badge variant="outline" className={cn('gap-1.5', pill.className)}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  SYSTEM {pill.label}
                </Badge>
              </CardTitle>
              <CardDescription>
                Emergency lockdown &amp; backup controller. One action backs up all data and code, flips the platform
                into LOCKED_DOWN, and applies edge firewall rules against threat IPs.
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
        {/* Status pills */}
        <div className="flex flex-wrap gap-3">
          <Pill
            label="SYSTEM MODE"
            value={MODE_LABELS[mode]}
            className={pill.className}
          />
          <Pill
            label="LAST BACKUP"
            value={status?.last_backup_at ? new Date(status.last_backup_at).toLocaleString() : 'Never'}
            className="bg-neutral-500/15 text-neutral-300 border-neutral-500/30"
          />
          <Pill
            label="BLOCKED ATTACKS"
            value={String(status?.blocked_attacks ?? 0)}
            className="bg-rose-500/15 text-rose-400 border-rose-500/30"
          />
          {status && status.threat_count > 0 && (
            <Pill label="THREAT IPs" value={String(status.threat_count)} className="bg-amber-500/15 text-amber-400 border-amber-500/30" />
          )}
        </div>

        {/* Poll / auth error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Status unavailable: {error}</span>
          </div>
        )}

        {loading && !status ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Red Button */}
            <div className="flex flex-col items-center justify-center gap-5 py-6">
              <div className="relative">
                {armable && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-rose-500/40"
                    animate={{ scale: [1, 1.22, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <motion.button
                  whileTap={armable ? { scale: 0.92 } : undefined}
                  disabled={!armable || submitting}
                  onClick={openArming}
                  title={rejection ?? 'Arm the Red Button'}
                  className={cn(
                    'relative h-36 w-36 rounded-full flex flex-col items-center justify-center gap-1 border transition-all',
                    'bg-gradient-to-br from-rose-500 to-red-700 text-white font-black tracking-widest',
                    'shadow-[0_0_60px_rgba(244,63,94,0.5)] border-rose-300/40',
                    armable ? 'cursor-pointer hover:shadow-[0_0_80px_rgba(244,63,94,0.7)]' : 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <ShieldAlert className="w-8 h-8" />
                  <span className="text-sm">RED BUTTON</span>
                </motion.button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-lg font-bold tracking-wide">
                  SYSTEM {pill.label}
                </p>
                {busy ? (
                  <p className="text-xs text-muted-foreground">All controls locked while the pipeline is running.</p>
                ) : rejection ? (
                  <p className="text-xs text-muted-foreground">{rejection}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Armed and ready. Triggering backs up data + code, locks the platform, and applies firewall rules.</p>
                )}
              </div>

              <div className="flex items-center gap-2">
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

            {/* Pipeline progress */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-neutral-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Radar className="w-4 h-4 text-rose-500" />
                    {status?.active_job ? `Job ${status.active_job.status.toUpperCase()}` : 'Pipeline'}
                  </p>
                  {status?.active_job && (
                    <span className="text-xs text-muted-foreground">{progress.done}/{progress.total} steps · {progress.pct}%</span>
                  )}
                </div>

                <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      status?.active_job?.status === 'failed' ? 'bg-rose-500' : 'bg-rose-500',
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
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Pipeline failed: {status.active_job.error_detail}. Platform moved to RECOVERY and the alert webhook was fired.</span>
                  </div>
                )}

                {mode === 'recovery' && !status?.active_job && (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>SYSTEM IN RECOVERY — the lockdown expired or failed. Review the audit log, then Resume operations.</span>
                  </div>
                )}
              </div>

              {/* Runbook */}
              {runbookOpen && (
                <div className="rounded-xl border border-border bg-neutral-900/60 p-4 text-sm text-muted-foreground space-y-1.5">
                  <p className="font-semibold text-foreground">Runbook</p>
                  <p>1. Confirm the incident with at least one other on-call admin.</p>
                  <p>2. Add known attacker IPs under threat tracking, then arm the Red Button.</p>
                  <p>3. The pipeline dumps the DB, archives code, verifies checksums, uploads offsite, flips LOCKED_DOWN, and applies firewall rules.</p>
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
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setArmingOpen(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-neutral-950 p-6 shadow-[0_0_60px_rgba(244,63,94,0.25)]"
              initial={{ scale: 0.94, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <h3 className="text-lg font-bold">Arm Red Button — Step {armStep} of 3</h3>
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
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                      Triggering will immediately: snapshot the database, archive the codebase, upload an offsite backup,
                      flip the platform into LOCKED_DOWN mode, and apply firewall rules against all threat IPs.
                      This is a production-wide action.
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-neutral-900 p-3">
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
                      <div className="rounded-lg border border-border bg-neutral-900 p-3 text-center">
                        <p className="font-mono text-lg font-bold tracking-wider text-rose-400">{phrase ?? '…'}</p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> Expires in 2 minutes. Enter it exactly as shown below.
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
                    <div className="space-y-2">
                      <Label htmlFor="red-phrase">Re-type the challenge phrase</Label>
                      <Input
                        id="red-phrase"
                        autoComplete="off"
                        placeholder="EMERALD-FALCON-TEMPEST"
                        value={phraseEntry}
                        onChange={(e) => setPhraseEntry(e.target.value.toUpperCase())}
                      />
                    </div>
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
                      className="text-7xl font-black text-rose-500"
                    >
                      {countdown}
                    </motion.p>
                    <p className="text-sm text-muted-foreground">Firing the Red Button…</p>
                    {submitting && <Loader2 className="w-5 h-5 animate-spin text-rose-500" />}
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
                    disabled={pin.length < 4 || phraseEntry !== phrase}
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
