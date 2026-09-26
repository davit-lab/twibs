import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { useBusiness } from '@/contexts/BusinessContext';
import type {
  BusinessAudience,
  BusinessBilling,
  BusinessCampaign,
  BusinessInsights,
  BusinessMember,
  BusinessOverview,
  BusinessSettings,
} from '@/lib/business';

export function useBusinessOverview(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessOverview>({
    queryKey: ['business', businessId, 'overview'],
    queryFn: () => api.getBusinessOverview(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessInsights(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessInsights>({
    queryKey: ['business', businessId, 'insights'],
    queryFn: () => api.getBusinessInsights(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessAudience(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessAudience>({
    queryKey: ['business', businessId, 'audience'],
    queryFn: () => api.getBusinessAudience(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessBilling(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessBilling>({
    queryKey: ['business', businessId, 'billing'],
    queryFn: () => api.getBusinessBilling(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessCampaigns(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessCampaign[]>({
    queryKey: ['business', businessId, 'campaigns'],
    queryFn: () => api.getBusinessCampaigns(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessMembers(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessMember[]>({
    queryKey: ['business', businessId, 'members'],
    queryFn: () => api.getBusinessMembers(businessId as string),
    enabled: !!businessId,
  });
}

export function useBusinessSettings(businessId: string | undefined) {
  const api = useBusinessApi();
  return useQuery<BusinessSettings | null>({
    queryKey: ['business', businessId, 'settings'],
    queryFn: () => api.getBusinessSettings(businessId as string),
    enabled: !!businessId,
  });
}

// ---------------------------------------------------------------------------
// Mutations shared across tabs (auto-refresh their data on success)
// ---------------------------------------------------------------------------

export function useUpdateBusinessSettings(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Parameters<ReturnType<typeof useBusinessApi>['updateBusinessSettings']>[1]) =>
      api.updateBusinessSettings(businessId as string, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId, 'settings'] });
    },
  });
}

export function useUpdateBusinessProfile(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  const { patchAccount } = useBusiness();
  return useMutation({
    mutationFn: (updates: Parameters<ReturnType<typeof useBusinessApi>['updateBusinessProfile']>[1]) =>
      api.updateBusinessProfile(businessId as string, updates),
    onSuccess: (updated) => {
      // Keep the active identity in sync so the switcher, composer and profile
      // header all reflect the edit without waiting on a refetch.
      if (businessId && updated) patchAccount(businessId, updated);
      queryClient.invalidateQueries({ queryKey: ['business', businessId] });
    },
  });
}

export function useAddBusinessMember(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; role: 'admin' | 'advertiser' | 'analyst' }) =>
      api.addBusinessMember(businessId as string, input.username, input.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId, 'members'] });
    },
  });
}

export function useUpdateBusinessMemberRole(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: 'admin' | 'advertiser' | 'analyst' }) =>
      api.updateBusinessMemberRole(businessId as string, input.userId, input.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId, 'members'] });
    },
  });
}

export function useRemoveBusinessMember(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeBusinessMember(businessId as string, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId, 'members'] });
    },
  });
}

export function useCreditBusinessBalance(businessId: string | undefined) {
  const api = useBusinessApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amountCents: number) => api.creditBusinessBalance(businessId as string, amountCents),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId, 'billing'] });
    },
  });
}