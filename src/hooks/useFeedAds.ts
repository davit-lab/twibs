import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchFeedAds } from '@/hooks/useAds';
import type { FeedAd } from '@/lib/ads';
import { isBrowserOffline, logUnlessNetworkError } from '@/lib/network';

/**
 * Fetches sponsored ads for the signed-in user. Every call maps to a real
 * get_feed_ads RPC over live campaign/audience data, so only genuinely
 * active, in-target campaigns are returned.
 */
export function useFeedAds(limit = 2) {
  const { user } = useAuth();
  const [ads, setAds] = useState<FeedAd[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setAds([]);
      setLoading(false);
      return;
    }
    if (isBrowserOffline()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchFeedAds(user.id, limit);
      setAds((data as FeedAd[]) || []);
    } catch (e) {
      logUnlessNetworkError('[ads] feed ads fetch error:', e);
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [refresh]);

  return { ads, loading, refresh };
}
