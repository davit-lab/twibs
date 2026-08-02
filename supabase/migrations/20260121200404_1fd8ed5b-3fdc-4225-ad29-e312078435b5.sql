-- Book purchases table to track who bought which books
CREATE TABLE public.book_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL,
  author_id UUID NOT NULL,
  amount_paid INTEGER NOT NULL, -- in cents
  platform_fee INTEGER NOT NULL, -- 20% in cents
  author_earnings INTEGER NOT NULL, -- 80% in cents
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, refunded
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Author Stripe Connect accounts
CREATE TABLE public.author_stripe_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  stripe_account_id TEXT NOT NULL,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Author earnings summary (for quick stats)
CREATE TABLE public.author_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  total_sales INTEGER NOT NULL DEFAULT 0, -- count
  total_revenue INTEGER NOT NULL DEFAULT 0, -- in cents
  total_platform_fees INTEGER NOT NULL DEFAULT 0, -- in cents
  total_author_earnings INTEGER NOT NULL DEFAULT 0, -- in cents
  pending_payout INTEGER NOT NULL DEFAULT 0, -- in cents
  last_payout_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.book_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_earnings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for book_purchases
CREATE POLICY "Users can view their own purchases"
ON public.book_purchases FOR SELECT
USING (buyer_id = auth.uid() OR author_id = auth.uid() OR is_admin_or_moderator());

CREATE POLICY "System can insert purchases"
ON public.book_purchases FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update purchases"
ON public.book_purchases FOR UPDATE
USING (true);

-- RLS Policies for author_stripe_accounts
CREATE POLICY "Users can view their own stripe account"
ON public.author_stripe_accounts FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their stripe account"
ON public.author_stripe_accounts FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their stripe account"
ON public.author_stripe_accounts FOR UPDATE
USING (user_id = auth.uid());

-- RLS Policies for author_earnings
CREATE POLICY "Users can view their own earnings"
ON public.author_earnings FOR SELECT
USING (user_id = auth.uid() OR is_admin_or_moderator());

CREATE POLICY "System can insert earnings"
ON public.author_earnings FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update earnings"
ON public.author_earnings FOR UPDATE
USING (true);

-- Function to check if user owns a book (purchased or is author)
CREATE OR REPLACE FUNCTION public.user_owns_book(_user_id UUID, _book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- User is the author
    SELECT 1 FROM public.books WHERE id = _book_id AND author_id = _user_id
    UNION
    -- User purchased the book
    SELECT 1 FROM public.book_purchases WHERE book_id = _book_id AND buyer_id = _user_id AND status = 'completed'
    UNION
    -- Book is free
    SELECT 1 FROM public.books WHERE id = _book_id AND (is_free = true OR price IS NULL OR price = 0)
  )
$$;

-- Trigger for updated_at
CREATE TRIGGER update_book_purchases_updated_at
BEFORE UPDATE ON public.book_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_author_stripe_accounts_updated_at
BEFORE UPDATE ON public.author_stripe_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_author_earnings_updated_at
BEFORE UPDATE ON public.author_earnings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();