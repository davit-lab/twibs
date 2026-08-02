import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useAuth } from '@/contexts/AuthContext';

export interface InterestPermissions {
  canPostToInterests: boolean;
  canViewInterestsFeed: boolean;
  canCreateInterestContent: boolean;
  isPremium: boolean;
  isLoading: boolean;
}

/**
 * Hook to check user permissions for interest-related features
 * Premium users have full access, regular users have limited access
 */
export function useInterestPermissions(): InterestPermissions {
  const { user } = useAuth();
  const { data: isPremium, isLoading } = usePremiumStatus(user?.id);

  return {
    // Only premium users can post to interests
    canPostToInterests: !!isPremium,
    // Everyone can view the interests feed
    canViewInterestsFeed: true,
    // Only premium users can create interest-specific content
    canCreateInterestContent: !!isPremium,
    isPremium: !!isPremium,
    isLoading,
  };
}

/**
 * Hook to check if a specific user has interest permissions
 */
export function useUserInterestPermissions(userId: string | undefined) {
  const { data: isPremium, isLoading } = usePremiumStatus(userId);

  return {
    canPostToInterests: !!isPremium,
    canViewInterestsFeed: true,
    canCreateInterestContent: !!isPremium,
    isPremium: !!isPremium,
    isLoading,
  };
}
