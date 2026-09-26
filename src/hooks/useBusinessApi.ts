// Data layer for the Business area. Every RPC maps 1:1 to a backend function in
// migration 20260925000000_business_accounts.sql. The UI only ever talks to
// SECURITY DEFINER RPCs (or the handful of RLS-safe tables) — never direct
// writes to member-only tables.

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  BusinessAccount,
  BusinessAccountType,
  BusinessAudience,
  BusinessBilling,
  BusinessCampaign,
  BusinessInsights,
  BusinessMember,
  BusinessOverview,
  BusinessRole,
  BusinessSettings,
  DiscoveryPriority,
} from '@/lib/business';
import type { CampaignObjective } from '@/lib/ads';
import { friendlyErrorMessage } from '@/lib/errors';

const rpc = (supabase as any).rpc.bind(supabase);

const clampAmount = (cents: number) => Math.max(0, Math.round(cents));

/**
 * Turns a supabase-js `PostgrestError` (a plain object, NOT an Error) into a
 * real `Error` carrying a human-readable message.
 *
 * Without this, callers that use the common
 * `err instanceof Error ? err.message : 'Something went wrong'` pattern never
 * see the real reason (e.g. "That username is already taken") because the
 * thrown value is not an `Error` instance. Throwing a genuine Error here means
 * every business call site reports the true cause with no changes needed.
 */
function toBusinessError(error: unknown): Error {
  return new Error(friendlyErrorMessage(error, 'The business service is unavailable.'));
}

export function useBusinessApi() {
  const listBusinessAccounts = useCallback(async (): Promise<BusinessAccount[]> => {
    const { data, error } = await rpc('get_business_accounts', {});
    if (error) throw toBusinessError(error);
    return (data as BusinessAccount[]) || [];
  }, []);

  const createBusinessAccount = useCallback(
    async (input: {
      account_type: BusinessAccountType;
      name: string;
      username: string;
      category?: string;
      description?: string;
      avatar_url?: string;
      cover_url?: string;
      website?: string;
      location?: string;
      goals?: string[];
    }): Promise<BusinessAccount> => {
      const { data, error } = await rpc('create_business_account', {
        p_account_type: input.account_type,
        p_name: input.name,
        p_username: input.username,
        p_category: input.category || null,
        p_description: input.description || null,
        p_avatar_url: input.avatar_url || null,
        p_cover_url: input.cover_url || null,
        p_website: input.website || null,
        p_location: input.location || null,
        p_goals: input.goals || [],
      });
      if (error) throw toBusinessError(error);
      return data as BusinessAccount;
    },
    []
  );

  const updateBusinessProfile = useCallback(
    async (
      businessId: string,
      updates: {
        name?: string;
        username?: string;
        category?: string;
        description?: string;
        avatar_url?: string;
        cover_url?: string;
        website?: string;
        location?: string;
        goals?: string[];
        /** Set to clear the avatar. Separate from `avatar_url` because the RPC
         *  overloads NULL as "leave unchanged" for partial updates. */
        clear_avatar?: boolean;
        /** Set to clear the cover. See `clear_avatar`. */
        clear_cover?: boolean;
      }
    ): Promise<Partial<BusinessAccount>> => {
      const { data, error } = await rpc('update_business_profile', {
        p_business_id: businessId,
        // Omitted optional text fields are sent as NULL = keep current value.
        // To clear one, pass an empty string (the RPC maps '' -> NULL).
        p_name: updates.name ?? null,
        p_username: updates.username ?? null,
        p_category: updates.category ?? null,
        p_description: updates.description ?? null,
        p_avatar_url: updates.avatar_url ?? null,
        p_cover_url: updates.cover_url ?? null,
        p_website: updates.website ?? null,
        p_location: updates.location ?? null,
        p_goals: updates.goals ?? null,
        p_clear_avatar: updates.clear_avatar ?? false,
        p_clear_cover: updates.clear_cover ?? false,
      });
      if (error) throw toBusinessError(error);
      return (data ?? {}) as Partial<BusinessAccount>;
    },
    []
  );

  const updateBusinessSettings = useCallback(
    async (
      businessId: string,
      updates: {
        discovery_priority?: DiscoveryPriority;
        audience_expansion?: boolean;
        quality_signals?: Record<string, unknown>;
      }
    ): Promise<void> => {
      const { error } = await rpc('update_business_settings', {
        p_business_id: businessId,
        p_discovery_priority: updates.discovery_priority ?? null,
        p_audience_expansion: updates.audience_expansion ?? null,
        p_quality_signals: updates.quality_signals ?? null,
      });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const getBusinessOverview = useCallback(
    async (businessId: string): Promise<BusinessOverview> => {
      const { data, error } = await rpc('get_business_overview', { p_business_id: businessId });
      if (error) throw toBusinessError(error);
      return (data as BusinessOverview) || {};
    },
    []
  );

  const getBusinessInsights = useCallback(
    async (businessId: string): Promise<BusinessInsights> => {
      const { data, error } = await rpc('get_business_insights', { p_business_id: businessId });
      if (error) throw toBusinessError(error);
      return (data as BusinessInsights) || {};
    },
    []
  );

  const getBusinessAudience = useCallback(
    async (businessId: string): Promise<BusinessAudience> => {
      const { data, error } = await rpc('get_business_audience', { p_business_id: businessId });
      if (error) throw toBusinessError(error);
      return (data as BusinessAudience) || {};
    },
    []
  );

  const getBusinessBilling = useCallback(
    async (businessId: string): Promise<BusinessBilling> => {
      const { data, error } = await rpc('get_business_billing', { p_business_id: businessId });
      if (error) throw toBusinessError(error);
      return (data as BusinessBilling) || {};
    },
    []
  );

  const getBusinessCampaigns = useCallback(
    async (businessId: string): Promise<BusinessCampaign[]> => {
      const { data, error } = await rpc('get_business_campaigns', { p_business_id: businessId });
      if (error) throw toBusinessError(error);
      return (data as BusinessCampaign[]) || [];
    },
    []
  );

  const getBusinessProfile = useCallback(
    async (username: string): Promise<BusinessAccount> => {
      const { data, error } = await rpc('get_business_profile', { p_username: username });
      if (error) throw toBusinessError(error);
      return data as BusinessAccount;
    },
    []
  );

  const creditBusinessBalance = useCallback(
    async (businessId: string, amountCents: number): Promise<void> => {
      const { error } = await rpc('credit_business_balance', {
        p_business_id: businessId,
        p_amount_cents: clampAmount(amountCents),
      });
      if (error) throw toBusinessError(error);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Team management
  // -------------------------------------------------------------------------

  const getBusinessMembers = useCallback(async (businessId: string): Promise<BusinessMember[]> => {
    const { data, error } = await (supabase as any)
      .from('business_members')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) throw toBusinessError(error);
    const members = (data as BusinessMember[]) || [];
    const userIds = members.map((m) => m.user_id);
    if (userIds.length === 0) return members;
    const { data: profiles, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('user_id, username, display_name, avatar_url')
      .in('user_id', userIds);
    if (profileError) throw toBusinessError(profileError);
    const profileMap = new Map(
      ((profiles as any[]) || []).map((p) => [p.user_id, p])
    );
    return members.map((m) => ({
      ...m,
      username: profileMap.get(m.user_id)?.username ?? '',
      display_name: profileMap.get(m.user_id)?.display_name ?? 'Unknown',
      avatar_url: profileMap.get(m.user_id)?.avatar_url ?? null,
    }));
  }, []);

  const addBusinessMember = useCallback(
    async (businessId: string, username: string, role: BusinessRole): Promise<void> => {
      const { error } = await rpc('add_business_member', {
        p_business_id: businessId,
        p_username: username,
        p_role: role,
      });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const updateBusinessMemberRole = useCallback(
    async (businessId: string, userId: string, role: BusinessRole): Promise<void> => {
      const { error } = await rpc('update_business_member_role', {
        p_business_id: businessId,
        p_user_id: userId,
        p_role: role,
      });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const removeBusinessMember = useCallback(
    async (businessId: string, userId: string): Promise<void> => {
      const { error } = await rpc('remove_business_member', {
        p_business_id: businessId,
        p_user_id: userId,
      });
      if (error) throw toBusinessError(error);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Campaigns / boosting
  // -------------------------------------------------------------------------

  const createBusinessCampaign = useCallback(
    async (input: {
      advertiser_id: string;
      name: string;
      objective: CampaignObjective;
      total_budget_cents: number;
      budget_type?: 'daily' | 'total';
      daily_budget_cents?: number;
      start_at?: string;
      end_at?: string;
      post_id?: string;
      description?: string;
      cta?: string;
      cta_url?: string;
      targeting?: Record<string, unknown>;
      distribution_priority?: DiscoveryPriority;
      audience_expansion?: boolean;
    }): Promise<{ id: string }> => {
      const { data, error } = await rpc('create_business_campaign', {
        p_advertiser_id: input.advertiser_id,
        p_name: input.name,
        p_objective: input.objective,
        p_total_budget_cents: clampAmount(input.total_budget_cents),
        p_currency: 'USD',
        p_budget_type: input.budget_type || 'total',
        p_daily_budget_cents: input.daily_budget_cents ?? null,
        p_start_at: input.start_at ?? null,
        p_end_at: input.end_at ?? null,
        p_is_scheduled: false,
        p_post_id: input.post_id ?? null,
        p_description: input.description ?? null,
        p_cta: input.cta ?? null,
        p_cta_url: input.cta_url ?? null,
        p_targeting: input.targeting ?? null,
        p_distribution_priority: input.distribution_priority ?? 'normal',
        p_audience_expansion: input.audience_expansion ?? true,
      });
      if (error) throw toBusinessError(error);
      return data as { id: string };
    },
    []
  );

  const createBoostCampaign = useCallback(
    async (input: {
      advertiser_id: string;
      post_id: string;
      goal: CampaignObjective;
      budget_cents: number;
      days: number;
      description?: string;
      distribution_priority?: DiscoveryPriority;
      audience_expansion?: boolean;
      targeting?: Record<string, unknown>;
    }): Promise<{ id: string }> => {
      const { data, error } = await rpc('create_boost_campaign', {
        p_advertiser_id: input.advertiser_id,
        p_post_id: input.post_id,
        p_goal: input.goal,
        p_budget_cents: clampAmount(input.budget_cents),
        p_days: Math.max(1, Math.min(90, Math.round(input.days))),
        p_description: input.description ?? null,
        p_distribution_priority: input.distribution_priority ?? 'normal',
        p_audience_expansion: input.audience_expansion ?? true,
        p_targeting: input.targeting ?? null,
      });
      if (error) throw toBusinessError(error);
      return data as { id: string };
    },
    []
  );

  const submitBoostCampaign = useCallback(
    async (campaignId: string): Promise<void> => {
      const { error } = await rpc('submit_boost_campaign', { p_campaign_id: campaignId });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const pauseCampaign = useCallback(
    async (campaignId: string): Promise<void> => {
      const { error } = await rpc('pause_campaign', { p_campaign_id: campaignId });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const resumeCampaign = useCallback(
    async (campaignId: string): Promise<void> => {
      const { error } = await rpc('resume_campaign', { p_campaign_id: campaignId });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const endCampaign = useCallback(
    async (campaignId: string): Promise<void> => {
      const { error } = await rpc('end_campaign', { p_campaign_id: campaignId });
      if (error) throw toBusinessError(error);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Follow (public business profiles — RLS-safe direct table writes)
  // -------------------------------------------------------------------------

  const followBusiness = useCallback(
    async (businessId: string, userId: string): Promise<void> => {
      const { error } = await (supabase as any)
        .from('business_followers')
        .insert({ business_id: businessId, user_id: userId });
      if (error) throw toBusinessError(error);
    },
    []
  );

  const unfollowBusiness = useCallback(
    async (businessId: string, userId: string): Promise<void> => {
      const { error } = await (supabase as any)
        .from('business_followers')
        .delete()
        .eq('business_id', businessId)
        .eq('user_id', userId);
      if (error) throw toBusinessError(error);
    },
    []
  );

  const getBusinessSettings = useCallback(
    async (businessId: string): Promise<BusinessSettings | null> => {
      const { data, error } = await (supabase as any)
        .from('business_settings')
        .select('*')
        .eq('business_id', businessId)
        .single();
      if (error) return null;
      return data as BusinessSettings;
    },
    []
  );

  return {
    listBusinessAccounts,
    createBusinessAccount,
    updateBusinessProfile,
    updateBusinessSettings,
    getBusinessOverview,
    getBusinessInsights,
    getBusinessAudience,
    getBusinessBilling,
    getBusinessCampaigns,
    getBusinessProfile,
    getBusinessSettings,
    creditBusinessBalance,
    getBusinessMembers,
    addBusinessMember,
    updateBusinessMemberRole,
    removeBusinessMember,
    createBusinessCampaign,
    createBoostCampaign,
    submitBoostCampaign,
    pauseCampaign,
    resumeCampaign,
    endCampaign,
    followBusiness,
    unfollowBusiness,
  };
}