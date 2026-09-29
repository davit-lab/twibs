import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { useQueryClient } from '@tanstack/react-query';
import type { BusinessAccount } from '@/lib/business';

export type IdentityType = 'personal' | 'business';

export interface ActiveIdentity {
  type: IdentityType;
  userId: string | null;
  businessId: string | null;
  business: BusinessAccount | null;
  profile: {
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

interface ActiveIdentityContextType {
  identity: ActiveIdentity;
  isLoading: boolean;
  switchToPersonal: () => void;
  switchToBusiness: (businessId: string) => void;
  refresh: () => Promise<void>;
}

const ActiveIdentityContext = createContext<ActiveIdentityContextType | undefined>(undefined);

export function ActiveIdentityProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { accountsLoading, mode, activeBusiness, switchToPersonal: bizSwitchToPersonal, switchToBusiness: bizSwitchToBusiness, refresh: bizRefresh } = useBusiness();
  const queryClient = useQueryClient();
  const isLoading = accountsLoading;

  const identity = useMemo<ActiveIdentity>(() => {
    if (!user) {
      return {
        type: 'personal',
        userId: null,
        businessId: null,
        business: null,
        profile: null,
      };
    }

    if (mode === 'business' && !activeBusiness) {
      return { type: 'business', userId: user.id, businessId: null, business: null, profile: null };
    }
    if (mode === 'business' && activeBusiness) {
      return {
        type: 'business',
        userId: user.id,
        businessId: activeBusiness.id,
        business: activeBusiness,
        profile: { id: activeBusiness.id, user_id: user.id, username: activeBusiness.username, display_name: activeBusiness.name, avatar_url: activeBusiness.avatar_url, is_verified: false },
      };
    }

    return {
      type: 'personal',
      userId: user.id,
      businessId: null,
      business: null,
      profile,
    };
  }, [user, profile, mode, activeBusiness]);

  const invalidateIdentityCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['messages'] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    queryClient.invalidateQueries({ queryKey: ['explore'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['business'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['reels'] });
    queryClient.invalidateQueries({ queryKey: ['stories'] });
    queryClient.invalidateQueries({ queryKey: ['comments'] });
  }, [queryClient]);

  const switchToPersonal = useCallback(() => {
    if (!user) return;
    bizSwitchToPersonal();
    invalidateIdentityCaches();
  }, [user, bizSwitchToPersonal, invalidateIdentityCaches]);

  const switchToBusiness = useCallback((businessId: string) => {
    if (!user) return;
    bizSwitchToBusiness(businessId);
    invalidateIdentityCaches();
  }, [user, bizSwitchToBusiness, invalidateIdentityCaches]);

  const refresh = useCallback(async () => {
    await bizRefresh();
    invalidateIdentityCaches();
  }, [bizRefresh, invalidateIdentityCaches]);

  return (
    <ActiveIdentityContext.Provider
      value={{
        identity,
        isLoading,
        switchToPersonal,
        switchToBusiness,
        refresh,
      }}
    >
      {children}
    </ActiveIdentityContext.Provider>
  );
}

export function useActiveIdentity() {
  const context = useContext(ActiveIdentityContext);
  if (context === undefined) {
    throw new Error('useActiveIdentity must be used within an ActiveIdentityProvider');
  }
  return context;
}