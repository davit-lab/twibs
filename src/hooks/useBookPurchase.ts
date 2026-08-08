import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface BookPurchase {
  id: string;
  book_id: string;
  buyer_id: string;
  author_id: string;
  amount_paid: number;
  platform_fee: number;
  author_earnings: number;
  status: string;
  created_at: string;
}

export interface AuthorEarnings {
  id: string;
  user_id: string;
  total_sales: number;
  total_revenue: number;
  total_platform_fees: number;
  total_author_earnings: number;
  pending_payout: number;
  last_payout_at: string | null;
}

export interface StripeConnectStatus {
  hasAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountId?: string;
}

export function useBookPurchaseStatus(bookId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['book-purchase-status', bookId, user?.id],
    queryFn: async () => {
      if (!user || !bookId) return { hasPurchased: false, isPending: false };

      const { data, error } = await supabase
        .from('book_purchases')
        .select('id, status')
        .eq('book_id', bookId)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking purchase status:', error);
        return { hasPurchased: false, isPending: false };
      }

      return {
        hasPurchased: data?.status === 'completed',
        isPending: data?.status === 'pending',
      };
    },
    enabled: !!user && !!bookId,
  });
}

export function useCreateBookCheckout() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ bookId }: { bookId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in to purchase');
      }

      const { data, error } = await supabase.functions.invoke('create-book-checkout', {
        body: { 
          bookId,
          successUrl: `${window.location.origin}/library/book/${bookId}?purchased=true`,
          cancelUrl: `${window.location.origin}/library/book/${bookId}?canceled=true`,
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
        title: 'Purchase failed',
        description: error.message,
      });
    },
  });
}

export function useAuthorEarnings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['author-earnings', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('author_earnings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching earnings:', error);
        throw error;
      }

      return data as AuthorEarnings | null;
    },
    enabled: !!user,
  });
}

export function useAuthorSales() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['author-sales', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('book_purchases')
        .select(`
          *,
          book:books(id, title, cover_url)
        `)
        .eq('author_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sales:', error);
        return [];
      }

      // Fetch buyer profiles separately (book_purchases has no FK to profiles)
      const sales = (data || []) as any[];
      const buyerIds = [...new Set(sales.map(s => s.buyer_id))];
      if (buyerIds.length > 0) {
        const { data: buyers } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', buyerIds);
        const buyersMap = new Map((buyers || []).map((b: any) => [b.user_id, b]));
        return sales.map((s: any) => ({ ...s, buyer: buyersMap.get(s.buyer_id) }));
      }

      return sales;
    },
    enabled: !!user,
  });
}

export function useStripeConnectStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['stripe-connect-status', user?.id],
    queryFn: async (): Promise<StripeConnectStatus> => {
      if (!user) {
        return {
          hasAccount: false,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        };
      }

      const { data, error } = await supabase.functions.invoke('check-connect-status');

      if (error) {
        console.error('Error checking connect status:', error);
        return {
          hasAccount: false,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        };
      }

      return data as StripeConnectStatus;
    },
    enabled: !!user,
  });
}

export function useCreateConnectAccount() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in');
      }

      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { 
          returnUrl: `${window.location.origin}/settings?stripe=complete`,
        },
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No onboarding URL returned');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stripe-connect-status'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Setup failed',
        description: error.message,
      });
    },
  });
}

export function useGetPdfAccess() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ bookId }: { bookId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Please log in to access this book');
      }

      const { data, error } = await supabase.functions.invoke('get-pdf-access', {
        body: { bookId },
      });

      if (error) throw error;
      
      return data as { url: string; title: string; expiresIn: number };
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Access denied',
        description: error.message,
      });
    },
  });
}

// Check if a specific author has Stripe Connect enabled (for purchase buttons)
export function useAuthorStripeStatus(authorId: string | undefined) {
  return useQuery({
    queryKey: ['author-stripe-status', authorId],
    queryFn: async (): Promise<boolean> => {
      if (!authorId) return false;

      const { data, error } = await supabase
        .from('author_stripe_accounts')
        .select('charges_enabled')
        .eq('user_id', authorId)
        .maybeSingle();

      if (error) {
        console.error('Error checking author stripe status:', error);
        return false;
      }

      return data?.charges_enabled === true;
    },
    enabled: !!authorId,
  });
}
