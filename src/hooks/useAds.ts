import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  AdsOverview,
  AdvertiserAccount,
  Campaign,
  CampaignAnalytics,
  CampaignObjective,
  CampaignTargeting,
  CampaignBudgetType,
  FeedAd,
} from '@/lib/ads';

// NOTE: call `supabase.rpc(...)` directly rather than through a loosely-typed
// helper. PostgREST matches RPC parameters by exact name, so letting the
// generated `Database` types check the argument object is what catches a wrong
// `p_`-prefix before it silently ships (that mistake previously disabled the
// entire feed delivery pipeline).
const CAMPAIGN_SELECT = `
  *,
  advertiser_accounts (*),
  post:posts (id, content)
`;

/**
 * Shape returned by CAMPAIGN_SELECT before the embedded advertiser relation is
 * collapsed. PostgREST returns to-one embeds as either an object or an array
 * depending on relationship inference, so both are accepted.
 */
type CampaignRow = Omit<Campaign, 'advertiser_accounts'> & {
  advertiser_accounts: AdvertiserAccount | AdvertiserAccount[] | null;
};

function normalizeCampaign(raw: unknown): Campaign {
  const row = raw as CampaignRow;
  return {
    ...row,
    advertiser_accounts: Array.isArray(row.advertiser_accounts)
      ? row.advertiser_accounts[0]
      : row.advertiser_accounts,
  };
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(CAMPAIGN_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(((data ?? []) as unknown[]).map(normalizeCampaign));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return { campaigns, loading, error, refresh: fetchCampaigns };
}

export function useCampaign(campaignId: string | undefined) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(CAMPAIGN_SELECT)
        .eq('id', campaignId)
        .single();
      if (error) throw error;
      setCampaign(normalizeCampaign(data));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  return { campaign, loading, error, refresh: fetchCampaign };
}

export function useAdsOverview() {
  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('get_ads_overview');
      if (error) throw error;
      setOverview((data as unknown as AdsOverview) || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ads overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return { overview, loading, error, refresh: fetchOverview };
}

export function useCampaignAnalytics(campaignId: string | undefined) {
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .rpc('get_campaign_analytics', { p_campaign_id: campaignId });
      if (error) throw error;
      setAnalytics((data as unknown as CampaignAnalytics) || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refresh: fetchAnalytics };
}

export interface CreateCampaignInput {
  advertiser_id: string;
  name: string;
  objective: CampaignObjective;
  total_budget_cents: number;
  currency?: string;
  budget_type: CampaignBudgetType;
  daily_budget_cents?: number;
  start_at: string;
  end_at: string;
  is_scheduled?: boolean;
  post_id?: string | null;
  headline?: string;
  description?: string;
  cta?: string;
  cta_url?: string;
  targeting: CampaignTargeting;
}

export function useCampaignActions() {
  const createCampaign = useCallback(async (input: CreateCampaignInput) => {
    const { data, error } = await supabase.rpc('create_campaign', {
      p_advertiser_id: input.advertiser_id,
      p_name: input.name,
      p_objective: input.objective,
      p_total_budget_cents: input.total_budget_cents,
      p_currency: input.currency || 'USD',
      p_budget_type: input.budget_type,
      p_daily_budget_cents: input.daily_budget_cents ?? null,
      p_start_at: input.start_at,
      p_end_at: input.end_at,
      p_is_scheduled: input.is_scheduled ?? false,
      p_post_id: input.post_id ?? null,
      p_headline: input.headline ?? null,
      p_description: input.description ?? null,
      p_cta: input.cta ?? null,
      p_cta_url: input.cta_url ?? null,
      p_targeting: {
        automatic: input.targeting.automatic,
        locations: input.targeting.locations,
        languages: input.targeting.languages,
        interests: input.targeting.interests,
      },
    });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const submitCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.rpc('submit_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.rpc('pause_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.rpc('resume_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const endCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.rpc('end_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.rpc('cancel_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return data as unknown as Campaign;
  }, []);

  const reportAd = useCallback(
    async (advertisementId: string, reason: string, details?: string) => {
      const { data, error } = await supabase.rpc('report_ad', {
        p_advertisement_id: advertisementId,
        p_reason: reason,
        p_details: details ?? null,
      });
      if (error) throw error;
      return data;
    },
    []
  );

  return {
    createCampaign,
    submitCampaign,
    pauseCampaign,
    resumeCampaign,
    endCampaign,
    cancelCampaign,
    reportAd,
  };
}

export async function fetchFeedAds(viewerId: string, limit = 2, frequencyCap = 5) {
  // PostgREST matches RPC parameters by exact name, so these MUST carry the
  // `p_` prefix. Passing viewer_id/limit/frequency_cap makes the call fail and
  // silently served no ads at all, which killed the whole delivery pipeline.
  const { data, error } = await supabase.rpc('get_feed_ads', {
    p_viewer_id: viewerId,
    p_limit: limit,
    p_frequency_cap: frequencyCap,
  });
  if (error) throw error;
  return (data as unknown as FeedAd[]) || [];
}
