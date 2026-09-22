import { RINGBACK_VOLUME, RINGTONE_VOLUME, END_TONE_VOLUME } from '@/lib/callConstants';

type ToneKind = 'ringback' | 'ringtone' | 'end';

interface TonePattern {
  /** Array of [frequency, startOffsetSec, durationSec] tones in the loop. */
  notes: [number, number, number][];
  /** Total duration of one loop cycle in seconds. */
  cycleSec: number;
  volume: number;
}

// Outgoing ringback (caller hears while the remote is ringing). Classic
// double-beep cadence repeated every ~3s.
const RINGBACK: TonePattern = {
  notes: [
    [425, 0, 0.4],
    [425, 0.6, 0.4],
  ],
  cycleSec: 2.8,
  volume: RINGBACK_VOLUME,
};

// Incoming ringtone (played while the incoming call modal is visible).
// Distinct tri-tone ring repeated every ~2.5s.
const RINGTONE: TonePattern = {
  notes: [
    [440, 0, 0.22],
    [554, 0.26, 0.22],
    [659, 0.52, 0.3],
  ],
  cycleSec: 2.5,
  volume: RINGTONE_VOLUME,
};

// Brief end tone.
const END_TONE: TonePattern = {
  notes: [[520, 0, 0.18]],
  cycleSec: 1.0,
  volume: END_TONE_VOLUME,
};

const PATTERNS: Record<ToneKind, TonePattern> = {
  ringback: RINGBACK,
  ringtone: RINGTONE,
  end: END_TONE,
};

class CallAudioManager {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private intervalId: number | null = null;
  private loopTimerId: number | null = null;
  private pendingTones: number[] = [];

  private currentKind: ToneKind | null = null;
  private currentCallId: string | null = null;
  private isPlaying = false;

  /** Turns true when autoplay blocked; cleared on stop + ensureUnlocked. */
  private blocked = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Must be called from a user gesture to unlock autoplay (incoming ringtone). */
  ensureUnlocked() {
    const ctx = this.getContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.blocked && this.currentKind === 'ringtone' && this.currentCallId) {
      const callId = this.currentCallId;
      this.blocked = false;
      this.stopKind('ringtone', callId);
      this.startKind('ringtone', callId);
    }
    return ctx.state === 'running';
  }

  isBlocked(): boolean {
    return this.blocked;
  }

  startOutgoingRingback(callId: string) {
    this.startKind('ringback', callId);
  }

  stopOutgoingRingback(callId: string) {
    this.stopKind('ringback', callId);
  }

  startIncomingRingtone(callId: string) {
    this.startKind('ringtone', callId);
  }

  stopIncomingRingtone(callId: string) {
    this.stopKind('ringtone', callId);
  }

  playEndTone() {
    this.playToneOnce('end');
  }

  stopAll() {
    this.clearLoop();
    this.currentKind = null;
    this.currentCallId = null;
    this.isPlaying = false;
    this.blocked = false;
  }

  cleanup() {
    this.stopAll();
    this.teardownContext();
  }

  private startKind(kind: ToneKind, callId: string) {
    // The same sound is already running for this call: never duplicate.
    if (this.isPlaying && this.currentKind === kind && this.currentCallId === callId) return;

    // A different sound/call is active -> replace it cleanly.
    if (this.isPlaying) {
      this.clearLoop();
    }

    this.currentKind = kind;
    this.currentCallId = callId;
    this.isPlaying = true;
    this.blocked = false;

    const ctx = this.getContext();
    if (!ctx) {
      this.blocked = true;
      return;
    }

    if (ctx.state === 'suspended') {
      // Autoplay blocked: remember intent, resume on the next user gesture.
      this.blocked = true;
      ctx.resume().catch(() => {});
    }

    this.loopPattern(PATTERNS[kind]);
  }

  private stopKind(kind: ToneKind, callId: string) {
    if (this.currentKind !== kind || this.currentCallId !== callId) return;
    this.clearLoop();
    this.currentKind = null;
    this.currentCallId = null;
    this.isPlaying = false;
    this.blocked = false;
    // Don't tear down the context here; it may be reused by the call itself.
  }

  private playToneOnce(kind: ToneKind) {
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;
    const pattern = PATTERNS[kind];
    for (const [freq, offset, dur] of pattern.notes) {
      this.scheduleTone(ctx, pattern.volume, freq, pattern.cycleSec + offset, dur);
    }
  }

  private loopPattern(pattern: TonePattern) {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;

    const schedule = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const startIn = (this.currentKind === 'ringback' ? 0 : 0);
      for (const [freq, offset, dur] of pattern.notes) {
        this.scheduleTone(this.ctx, pattern.volume, freq, startIn + offset, dur);
      }
    };

    schedule();
    this.intervalId = window.setInterval(schedule, pattern.cycleSec * 1000);
  }

  private scheduleTone(ctx: AudioContext, volume: number, freq: number, atSec: number, durSec: number) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);

      const t0 = ctx.currentTime + atSec;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(volume, t0 + 0.02);
      g.gain.setValueAtTime(volume, t0 + durSec - 0.03);
      g.gain.linearRampToValueAtTime(0, t0 + durSec);

      osc.start(t0);
      osc.stop(t0 + durSec + 0.05);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    } catch {
      // Scheduling failures should never crash the call.
    }
  }

  private clearLoop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.loopTimerId !== null) {
      window.clearTimeout(this.loopTimerId);
      this.loopTimerId = null;
    }
  }

  private teardownContext() {
    this.clearLoop();
    try {
      this.ctx?.close();
    } catch {
      // already closed
    }
    this.ctx = null;
    this.gain = null;
  }
}

export const callAudio = new CallAudioManager();