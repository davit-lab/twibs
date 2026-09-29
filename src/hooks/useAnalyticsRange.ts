import { useCallback, useState } from 'react';
import { buildAnalyticsRange, type AnalyticsRange, type AnalyticsRangeKey } from '@/lib/business';

const STORAGE_KEY = 'twibs:business-analytics-range';

/**
 * Period selection for the Business analytics tabs.
 *
 * Defaults to 30 days rather than lifetime: a new owner opening the page should
 * see whether anything is happening now, and "All time" stays one click away.
 * The choice is remembered across tabs and reloads so Overview and Insights
 * never disagree about which window they describe.
 */
export function useAnalyticsRange(): [AnalyticsRange, (key: AnalyticsRangeKey, custom?: { from?: string | null; to?: string | null }) => void] {
  const [range, setRange] = useState<AnalyticsRange>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AnalyticsRange;
        if (parsed?.key) return buildAnalyticsRange(parsed.key, { from: parsed.from, to: parsed.to });
      }
    } catch {
      // Corrupt or unavailable storage must not break the page.
    }
    return buildAnalyticsRange('30d');
  });

  const select = useCallback(
    (key: AnalyticsRangeKey, custom?: { from?: string | null; to?: string | null }) => {
      const next = buildAnalyticsRange(key, custom);
      setRange(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private-mode storage failures are non-fatal.
      }
    },
    []
  );

  return [range, select];
}
