import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { clamp, formatClock, STORY_MAX_DURATION } from '@/lib/stories';

export interface TrimRange {
  start: number;
  end: number;
}

interface StoryVideoTrimmerProps {
  duration: number;
  value: TrimRange;
  onChange: (range: TrimRange) => void;
  max?: number;
}

const MIN_KEEP = 1;

export default function StoryVideoTrimmer({ duration, value, onChange, max = STORY_MAX_DURATION }: StoryVideoTrimmerProps) {
  const effectiveMax = Math.min(max, duration);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'start' | 'end' | 'segment' | null>(null);

  const clampStart = useCallback(
    (s: number) => clamp(Math.round(s * 100) / 100, 0, Math.max(0, value.end - MIN_KEEP)),
    [value.end],
  );
  const clampEnd = useCallback(
    (e: number) => clamp(Math.round(e * 100) / 100, Math.min(effectiveMax, value.start + MIN_KEEP), effectiveMax),
    [value.start, effectiveMax],
  );

  const secondsFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * effectiveMax;
  };

  const beginDrag = (kind: 'start' | 'end' | 'segment') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(kind);
    if (kind === 'segment') {
      const anchor = secondsFromEvent(e.clientX);
      const dragStart = { anchor, range: { ...value } };
      const move = (ev: PointerEvent) => {
        const delta = secondsFromEvent(ev.clientX) - anchor;
        const nextStart = clampStart(dragStart.range.start + delta);
        const drift = nextStart - (dragStart.range.start + delta);
        const nextEnd = clampEnd(dragStart.range.end + delta + drift);
        onChange({ start: nextStart, end: nextEnd });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDrag(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
  };

  const moveStep = (dir: -1 | 1, which: 'start' | 'end') => {
    const step = 0.1;
    if (which === 'start') onChange({ ...value, start: clampStart(value.start + dir * step) });
    else onChange({ ...value, end: clampEnd(value.end + dir * step) });
  };

  const left = (value.start / effectiveMax) * 100;
  const right = (value.end / effectiveMax) * 100;

  const handleMove =
    (which: 'start' | 'end') =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag(which);
      const move = (ev: PointerEvent) => {
        const secs = secondsFromEvent(ev.clientX);
        if (which === 'start') onChange({ ...value, start: clampStart(secs) });
        else onChange({ ...value, end: clampEnd(secs) });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDrag(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

  return (
    <div className="w-full select-none">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-zinc-400">Trim to a moment</span>
        <span className="font-mono text-zinc-500">
          {formatClock(value.end - value.start)} · max {formatClock(effectiveMax)}
        </span>
      </div>

      <div ref={trackRef} className="relative h-9 touch-none">
        {/* base track */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-800" />
        {/* dimmed out-of-range zones */}
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-l-full bg-zinc-700/60" style={{ left: 0, width: `${left}%` }} />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-r-full bg-zinc-700/60"
          style={{ left: `${right}%`, right: 0 }}
        />
        {/* kept segment */}
        <div
          className={cn(
            'absolute top-1/2 h-1.5 -translate-y-1/2 cursor-grab rounded-full bg-violet-500 active:cursor-grabbing',
            drag === 'segment' && 'bg-violet-400',
          )}
          style={{ left: `${left}%`, width: `${right - left}%` }}
          onPointerDown={beginDrag('segment')}
        />

        {/* start handle */}
        <div
          className="absolute -ml-3 top-1/2 h-7 w-6 -translate-y-1/2 cursor-ew-resize touch-none rounded-md bg-white shadow-lg"
          style={{ left: `${left}%` }}
          onPointerDown={handleMove('start')}
          aria-label="Trim start"
        />
        {/* end handle */}
        <div
          className="absolute -ml-3 top-1/2 h-7 w-6 -translate-y-1/2 cursor-ew-resize touch-none rounded-md bg-white shadow-lg"
          style={{ left: `${right}%` }}
          onPointerDown={handleMove('end')}
          aria-label="Trim end"
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Start</span>
          <button type="button" onClick={() => moveStep(-1, 'start')} className="h-7 w-7 rounded-md bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            −
          </button>
          <span className="w-9 text-center font-mono text-zinc-300 tabular-nums">{formatClock(value.start)}</span>
          <button type="button" onClick={() => moveStep(1, 'start')} className="h-7 w-7 rounded-md bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            +
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">End</span>
          <button type="button" onClick={() => moveStep(-1, 'end')} className="h-7 w-7 rounded-md bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            −
          </button>
          <span className="w-9 text-center font-mono text-zinc-300 tabular-nums">{formatClock(value.end)}</span>
          <button type="button" onClick={() => moveStep(1, 'end')} className="h-7 w-7 rounded-md bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            +
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
        Your story will be trimmed to the highlighted segment. Trimming re-encodes the clip in your browser.
      </p>
    </div>
  );
}