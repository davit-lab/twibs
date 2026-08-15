import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AdEventType, AdPlacement, FeedAd } from '@/lib/ads';

const rpc = (supabase as any).rpc.bind(supabase);

// Session-level dedupe: an impression is only fired once per ad per page load.
// The server additionally dedupes via the unique event_id (idempotency key),
// so React re-renders can never inflate impression counts.
const firedImpressions = new Set<string>();

export function makeEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `evt_${crypto.randomUUID()}`;
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Records a real ad event server-side. Only call this AFTER the underlying
 * user action actually happened (like inserted, post shared, follow accepted…).
 * Returns false when the server rejected/deduped the event.
 */
export async function recordAdEvent(
  campaignId: string,
  advertisementId: string,
  eventType: AdEventType,
  placement: AdPlacement = 'feed'
): Promise<boolean> {
  const eventId = makeEventId();
  const { data, error } = await rpc('record_ad_event', {
    p_event_id: eventId,
    p_campaign_id: campaignId,
    p_advertisement_id: advertisementId,
    p_event_type: eventType,
    p_placement: placement,
  });
  if (error) {
    console.error('[ads] event error', eventType, error);
    return false;
  }
  return data === true;
}

/**
 * Tracks a single impression: the ad must enter the viewport (>= 60% visible)
 * and stay visible for a minimum dwell time (1000ms) before the impression is
 * counted. Fires at most once per ad per session.
 */
export function useAdImpression(
  ref: React.RefObject<HTMLElement | null>,
  ad: Pick<FeedAd, 'advertisement_id' | 'campaign_id'> | null,
  enabled = true,
  placement: AdPlacement = 'feed'
) {
  const adRef = useRef(ad);
  adRef.current = ad;

  const record = useCallback(async () => {
    const current = adRef.current;
    if (!current) return;
    if (firedImpressions.has(current.advertisement_id)) return;
    firedImpressions.add(current.advertisement_id);
    await recordAdEvent(current.campaign_id, current.advertisement_id, 'impression', placement);
  }, [placement]);

  useEffect(() => {
    if (!enabled || !ad) return;
    const el = ref.current;
    if (!el) return;

    let visible = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const dwellMs = 1000;
    const minRatio = 0.6;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        visible = entry.isIntersecting && entry.intersectionRatio >= minRatio;
        if (visible) {
          if (!timer) {
            timer = setTimeout(() => {
              if (visible) {
                record();
              }
            }, dwellMs);
          }
        } else {
          clearTimer();
        }
      },
      { threshold: [0, 0.6] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimer();
    };
  }, [ref, ad, enabled, record, placement]);
}
