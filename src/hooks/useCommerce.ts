import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
export async function commerceAction<T = { url: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('marketplace-commerce', { body });
  if (error) {
    let message = error.message;
    try { const detail = await error.context?.json(); message = detail?.error || message; } catch { /* network error */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export function useCommerceOrders() {
  const { user } = useAuth(); const { identity } = useActiveIdentity();
  return useQuery({ queryKey: ['commerce-orders', user?.id, identity.type, identity.businessId], enabled: !!user && (identity.type === 'personal' || !!identity.businessId), refetchInterval: 15000, queryFn: async () => {
    let query = supabase.from('orders').select('*, order_items(*), advertiser_accounts(name, username)').order('created_at', { ascending: false }).limit(50);
    query = identity.businessId ? query.eq('business_id', identity.businessId) : query.eq('customer_id', user!.id);
    const { data, error } = await query; if (error) throw error; return data;
  } });
}
