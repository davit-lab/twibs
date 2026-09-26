// Types and display metadata for the Twibs-native Business area.
// The business system is a first-class part of Twibs — black/white + violet,
// data-driven, and every number comes from real backend rows.

import type {
  CampaignObjective,
  CampaignStatus,
  CampaignBudgetType,
} from '@/lib/ads';

export type BusinessAccountType = 'business' | 'creator' | 'organization' | 'project';
export type BusinessRole = 'owner' | 'admin' | 'advertiser' | 'analyst';
export type DiscoveryPriority = 'normal' | 'expanded' | 'promoted';

export interface BusinessAccount {
  id: string;
  account_type: BusinessAccountType;
  name: string;
  username: string;
  category: string | null;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  location: string | null;
  goals: string[];
  status: string;
  followers_count: number;
  created_at: string;
  role?: BusinessRole | null;
  is_owner?: boolean;
  is_following?: boolean;
  my_role?: BusinessRole | 'none';
}

export interface BusinessOverview {
  followers_count: number;
  followers_gained_7d: number;
  active_promotions: number;
  total_campaigns: number;
  total_spend_cents: number;
  reach: number;
  impressions: number;
  engagement: number;
  clicks: number;
  recent_content: {
    id: string;
    content: string;
    created_at: string;
    star_count: number | null;
    comment_count: number | null;
  }[];
}

export interface BusinessInsights {
  totals: {
    reach: number;
    impressions: number;
    clicks: number;
    profile_visits: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    follows: number;
    engagements: number;
    spend_cents: number;
  };
  daily: {
    date: string;
    impressions: number;
    engagements: number;
    spend_cents: number;
  }[];
  top_content: {
    campaign_id: string;
    campaign_name: string;
    status: string;
    post_id: string | null;
    content: string | null;
    impressions: number;
    engagements: number;
    spend_cents: number;
  }[];
}

export interface BusinessAudience {
  total_reach: number;
  returning_viewers: number;
  followers: number;
  locations: { location: string; count: number }[];
  languages: { language: string; count: number }[];
  interests: { name: string; count: number }[];
  top_engagers: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    count: number;
  }[];
}

export interface BusinessBilling {
  balance_cents: number;
  currency: string;
  total_credited_cents: number;
  total_spent_cents: number;
  transactions: {
    id: string;
    kind: 'credit' | 'debit' | 'refund';
    amount_cents: number;
    currency: string;
    description: string | null;
    campaign_id: string | null;
    created_at: string;
  }[];
}

export interface BusinessCampaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget_type: CampaignBudgetType;
  total_budget_cents: number;
  daily_budget_cents: number | null;
  currency: string;
  start_at: string;
  end_at: string;
  spend_cents: number;
  impressions_delivered: number;
  estimated_reach_min: number | null;
  estimated_reach_max: number | null;
  estimated_impressions: number | null;
  distribution_priority: DiscoveryPriority;
  audience_expansion: boolean;
  post_id: string | null;
  post_content: string | null;
  post_created_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface BusinessMember {
  business_id: string;
  user_id: string;
  role: BusinessRole;
  created_at: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
}

export interface BusinessSettings {
  business_id: string;
  discovery_priority: DiscoveryPriority;
  quality_signals: Record<string, unknown>;
  audience_expansion: boolean;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPE_META: Record<
  BusinessAccountType,
  { label: string; description: string }
> = {
  business: {
    label: 'Business',
    description: 'A company, store or professional brand.',
  },
  creator: {
    label: 'Creator',
    description: 'A public persona, artist or creator account.',
  },
  organization: {
    label: 'Organization',
    description: 'A non-profit, club, institution or group.',
  },
  project: {
    label: 'Project',
    description: 'A product, event or initiative.',
  },
};

export const ROLE_META: Record<BusinessRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control, including billing and team.' },
  admin: { label: 'Admin', description: 'Manages the business and team.' },
  advertiser: { label: 'Advertiser', description: 'Can create and submit promotions.' },
  analyst: { label: 'Analyst', description: 'Can view insights and reports.' },
};

export const PRIORITY_META: Record<DiscoveryPriority, { label: string; description: string }> = {
  normal: { label: 'Standard', description: 'Shown based on regular ranking.' },
  expanded: {
    label: 'Expanded reach',
    description: 'Allowed to reach audiences related to yours.',
  },
  promoted: {
    label: 'Boosted placement',
    description: 'Higher placement in feeds and reels.',
  },
};

export const BUSINESS_GOALS = [
  'Grow your audience',
  'Increase engagement',
  'Drive traffic to your website',
  'Build brand awareness',
  'Promote a product or service',
  'Grow your followers',
] as const;

export const ROLE_CAN = {
  canManage: (role: BusinessRole | null | undefined): boolean =>
    role === 'owner' || role === 'admin',
  canCreateCampaigns: (role: BusinessRole | null | undefined): boolean =>
    role === 'owner' || role === 'admin' || role === 'advertiser',
  canViewRestricted: (role: BusinessRole | null | undefined): boolean =>
    role === 'owner' || role === 'admin' || role === 'analyst',
};