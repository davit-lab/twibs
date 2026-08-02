import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'free' | 'pro' | 'premium';
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  features: string[];
  is_active: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan?: SubscriptionPlan;
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });

      if (error) throw error;
      
      return (data || []).map(plan => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features as string || '[]'),
      })) as SubscriptionPlan[];
    },
  });
}

export function useUserSubscription() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-subscription', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data?.plan) {
        const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
        return {
          ...data,
          plan: {
            ...plan,
            features: Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features as string || '[]'),
          },
        } as UserSubscription;
      }
      
      return data as UserSubscription | null;
    },
    enabled: !!user,
  });
}

export function useCreateCheckout() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ priceId }: { priceId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in to subscribe');
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { 
          priceId,
          successUrl: `${window.location.origin}/settings?success=true`,
          cancelUrl: `${window.location.origin}/pricing?canceled=true`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Checkout failed',
        description: error.message,
      });
    },
  });
}

export function useCustomerPortal() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in to manage your subscription');
      }

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        body: { 
          returnUrl: `${window.location.origin}/settings`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Portal access failed',
        description: error.message,
      });
    },
  });
}
