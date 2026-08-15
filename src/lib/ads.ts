// Shared types and helpers for the advertising system.
// Every number rendered in the ads UI originates from real database rows.

export type AdvertiserAccountType = 'personal' | 'business' | 'creator';
export type AdvertiserStatus = 'active' | 'suspended';

export type CampaignStatus =
  | 'draft'
  | 'pending_payment'
  | 'pending_review'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type CampaignObjective = 'reach' | 'profile_visits' | 'engagement' | 'followers';
export type CampaignBudgetType = 'daily' | 'total';

export type AdEventType =
  | 'impression'
  | 'click'
  | 'profile_visit'
  | 'like'
  | 'comment'
  | 'share'
  | 'save'
  | 'follow'
  | 'website_click'
  | 'conversion';

export type AdPlacement = 'feed' | 'explore';

export interface AdvertiserAccount {
  id: string;
  user_id: string;
  account_type: AdvertiserAccountType;
  name: string;
  username: string;
  category: string | null;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  location: string | null;
  status: AdvertiserStatus;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  advertiser_id: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget_type: CampaignBudgetType;
  total_budget_cents: number;
  daily_budget_cents: number | null;
  currency: string;
  start_at: string;
  end_at: string;
  is_scheduled: boolean;
  post_id: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  cta_url: string | null;
  estimated_reach_min: number | null;
  estimated_reach_max: number | null;
  estimated_impressions: number | null;
  cost_per_impression_cents: number;
  spend_cents: number;
  impressions_delivered: number;
  rejection_reason: string | null;
  moderation_note: string | null;
  paid_at: string | null;
  approved_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  advertiser_accounts?: AdvertiserAccount;
  post?: { id: string; content: string };
}

export interface CampaignTargeting {
  id?: string;
  campaign_id?: string;
  automatic: boolean;
  locations: string[];
  languages: string[];
  interests: string[];
  min_age?: number | null;
  max_age?: number | null;
}

export interface AudienceEstimate {
  total_active_users: number;
  matched_users: number;
  reach_min: number;
  reach_max: number;
  estimated_impressions: number;
  sufficient_data: boolean;
}

export interface CampaignTotals {
  impressions: number;
  reach: number;
  clicks: number;
  profile_visits: number;
  follows: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  website_clicks: number;
  conversions: number;
  engagements: number;
  spend_cents: number;
}

export interface CampaignAnalytics {
  totals: CampaignTotals;
  daily: CampaignDailyStat[];
  audience: {
    locations: { location: string; count: number }[];
    languages: { language: string; count: number }[];
    interests: { name: string; count: number }[];
  };
}

export interface CampaignDailyStat {
  date: string;
  impressions: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  profile_visits: number;
  website_clicks: number;
  conversions: number;
  spend_cents: number;
}

export interface AdsOverview {
  total_campaigns: number;
  active_campaigns: number;
  pending_review: number;
  total_spend_cents: number;
  impressions: number;
  reach: number;
  clicks: number;
  profile_visits: number;
  follows: number;
  engagements: number;
  website_clicks: number;
}

export interface FeedAd {
  advertisement_id: string;
  campaign_id: string;
  headline: string | null;
  description: string | null;
  cta: string | null;
  cta_url: string | null;
  objective: CampaignObjective;
  advertiser_id: string;
  advertiser_type: AdvertiserAccountType;
  advertiser_name: string;
  advertiser_username: string;
  advertiser_avatar_url: string | null;
  advertiser_is_verified: boolean;
  advertiser_user_id: string;
  profile_username: string;
  profile_privacy: 'public' | 'private';
  post_id: string | null;
  post_content: string | null;
  post_created_at: string | null;
  post_star_count: number | null;
  post_comment_count: number | null;
  post_media: { id: string; url: string; type: string; alt_text: string | null }[];
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

export const STATUS_META: Record<
  CampaignStatus,
  { label: string; dotClass: string; badgeClass: string; description: string }
> = {
  draft: {
    label: 'Draft',
    dotClass: 'bg-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground',
    description: 'Created but not yet submitted.',
  },
  pending_payment: {
    label: 'Payment required',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600',
    description: 'Waiting for payment confirmation.',
  },
  pending_review: {
    label: 'Pending review',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600',
    description: 'Submitted and awaiting staff approval.',
  },
  scheduled: {
    label: 'Scheduled',
    dotClass: 'bg-sky-500',
    badgeClass: 'bg-sky-500/10 text-sky-600',
    description: 'Approved and scheduled to start later.',
  },
  active: {
    label: 'Active',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600',
    description: 'Currently being delivered.',
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-600',
    description: 'Paused by the advertiser or staff.',
  },
  completed: {
    label: 'Completed',
    dotClass: 'bg-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground',
    description: 'Campaign has finished.',
  },
  cancelled: {
    label: 'Cancelled',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600',
    description: 'Cancelled before delivery.',
  },
  rejected: {
    label: 'Rejected',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-600',
    description: 'Rejected during moderation.',
  },
};

export const OBJECTIVE_META: Record<
  CampaignObjective,
  { label: string; description: string }
> = {
  reach: {
    label: 'More people see your post',
    description: 'Optimized toward impressions and reach.',
  },
  profile_visits: {
    label: 'More profile visits',
    description: 'Optimized toward visits to your profile.',
  },
  engagement: {
    label: 'More engagement',
    description: 'Optimized toward likes, comments, shares and saves.',
  },
  followers: {
    label: 'More followers',
    description: 'Optimized toward profile visits and follows.',
  },
};

export const CTA_OPTIONS = [
  { value: 'Learn More', description: 'Opens your website or link.' },
  { value: 'Visit Profile', description: 'Opens your profile.' },
  { value: 'Follow', description: 'Prompts visitors to follow you.' },
  { value: 'View Post', description: 'Opens the boosted post.' },
  { value: 'Visit Website', description: 'Opens your website in a new tab.' },
] as const;

export const AD_REPORT_REASONS = [
  'misleading',
  'inappropriate',
  'spam',
  'scam',
  'irrelevant',
  'other',
] as const;

// ---------------------------------------------------------------------------
// Formatting helpers (safe against zero/NaN denominators)
// ---------------------------------------------------------------------------

export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  const value = Math.max(0, Math.round(cents ?? 0)) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatNumber(n: number | null | undefined): string {
  const value = n ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.round(value)}`;
}

export function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function formatRate(numerator: number, denominator: number, currency = 'USD'): string {
  if (!denominator) return '—';
  return formatMoney(numerator / denominator, currency);
}

// ---------------------------------------------------------------------------
// Pure lifecycle helpers (also unit-tested)
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_ORDER: Record<CampaignStatus, number> = {
  draft: 0,
  pending_payment: 1,
  pending_review: 2,
  scheduled: 3,
  active: 4,
  paused: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

export const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['pending_review', 'cancelled'],
  pending_payment: ['pending_review', 'cancelled'],
  pending_review: ['active', 'scheduled', 'rejected', 'completed', 'cancelled'],
  scheduled: ['active', 'paused', 'completed', 'cancelled'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Which advertiser actions are valid for a campaign in the given state. */
export function campaignActions(status: CampaignStatus) {
  return {
    canSubmit: status === 'draft',
    canCancel: ['draft', 'pending_payment', 'pending_review', 'scheduled'].includes(status),
    canPause: status === 'active',
    canResume: status === 'paused',
    canEnd: ['active', 'paused', 'scheduled', 'pending_review'].includes(status),
  };
}
