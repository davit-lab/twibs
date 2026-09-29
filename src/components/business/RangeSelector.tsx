import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import {
  ANALYTICS_RANGE_PRESETS,
  buildAnalyticsRange,
  describeAnalyticsRange,
  type AnalyticsRange,
  type AnalyticsRangeKey,
} from '@/lib/business';

/**
 * Period switcher for the analytics RPCs.
 *
 * Deliberately a flat segmented row rather than a pill-heavy design: it reads
 * as part of the page chrome, and the active option is the only highlighted
 * element so the numbers below keep the visual weight.
 */
export function RangeSelector({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (next: AnalyticsRange) => void;
}) {
  const [showCustom, setShowCustom] = useState(value.key === 'custom');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const pick = (key: AnalyticsRangeKey) => {
    if (key === 'custom') {
      setShowCustom(true);
      onChange(buildAnalyticsRange('custom', { from, to }));
      return;
    }
    setShowCustom(false);
    onChange(buildAnalyticsRange(key));
  };

  const applyCustom = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo) onChange(buildAnalyticsRange('custom', { from: nextFrom, to: nextTo }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Analytics period"
        className="flex items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-0.5"
      >
        {ANALYTICS_RANGE_PRESETS.map((preset) => {
          const active = value.key === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => pick(preset.key)}
              className={
                active
                  ? 'rounded-[10px] bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm'
                  : 'rounded-[10px] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={value.key === 'custom'}
          onClick={() => pick('custom')}
          className={
            value.key === 'custom'
              ? 'flex items-center gap-1 rounded-[10px] bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm'
              : 'flex items-center gap-1 rounded-[10px] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground'
          }
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="date"
            value={from}
            max={to || undefined}
            aria-label="Period start date"
            onChange={(e) => applyCustom(e.target.value, to)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            aria-label="Period end date"
            onChange={(e) => applyCustom(from, e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </div>
      )}

      <span className="text-xs text-muted-foreground">{describeAnalyticsRange(value)}</span>
    </div>
  );
}
