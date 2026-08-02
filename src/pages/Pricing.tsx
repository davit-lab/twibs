import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionPlans, useUserSubscription, useCreateCheckout } from '@/hooks/useSubscription';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Crown, Zap, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const tierIcons: Record<string, React.ReactNode> = {
  pro: <Zap className="h-5 w-5" />,
  premium: <Crown className="h-5 w-5" />,
  free: <Check className="h-5 w-5" />,
};

const tierBg: Record<string, string> = {
  pro: 'bg-blue-500/10 text-blue-500',
  premium: 'bg-purple-500/10 text-purple-500',
  free: 'bg-muted text-muted-foreground',
};

export default function Pricing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [isYearly, setIsYearly] = useState(false);
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();
  const { data: subscription } = useUserSubscription();
  const createCheckout = useCreateCheckout();

  const canceled = searchParams.get('canceled') === 'true';

  const formatPrice = (cents: number) => {
    return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  };

  const handleSubscribe = (plan: typeof plans extends (infer T)[] ? T : never) => {
    if (plan.tier === 'free') return;

    const priceId = isYearly ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;

    if (!priceId) {
      return;
    }

    createCheckout.mutate({ priceId });
  };

  const isCurrentPlan = (tier: string) => {
    if (!subscription?.plan) {
      return tier === 'free';
    }
    return subscription.plan.tier === tier && subscription.status === 'active';
  };

  if (plansLoading) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-5 w-96 mx-auto" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 rounded-xl" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24 lg:pb-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
            Unlock premium features to enhance your reading and writing experience
          </p>

          {canceled && (
            <div className="mt-4 p-3 border border-destructive/20 bg-destructive/5 rounded-lg inline-block">
              <p className="text-sm text-muted-foreground">
                Checkout was canceled. Feel free to try again when you're ready.
              </p>
            </div>
          )}

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={cn('text-sm transition-colors', !isYearly && 'font-medium text-foreground')}>Monthly</span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={cn('text-sm transition-colors', isYearly && 'font-medium text-foreground')}>
              Yearly
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                Save 17%
              </Badge>
            </span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-5 items-start">
          {plans?.map((plan) => {
            const price = isYearly ? plan.price_yearly : plan.price_monthly;
            const isCurrent = isCurrentPlan(plan.tier);
            const isPopular = plan.tier === 'pro';

            return (
              <Card
                key={plan.id}
                className={cn(
                  'relative overflow-hidden transition-all duration-200',
                  isPopular && 'border-primary shadow-md md:scale-105 md:-my-2',
                  isCurrent && 'border-green-500/50'
                )}
              >
                {isPopular && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
                )}

                <CardHeader className="pt-6 pb-4">
                  <div className="flex items-center justify-between">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', tierBg[plan.tier])}>
                      {tierIcons[plan.tier] || tierIcons.free}
                    </div>
                    {isPopular && (
                      <Badge variant="default" className="text-xs">Popular</Badge>
                    )}
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs text-green-600 dark:text-green-400">Current</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-4">{plan.name}</CardTitle>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  )}
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* Price */}
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight">${formatPrice(price)}</span>
                      {price > 0 && (
                        <span className="text-sm text-muted-foreground">/{isYearly ? 'year' : 'month'}</span>
                      )}
                    </div>
                    {isYearly && plan.price_monthly > 0 && price > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ${formatPrice(plan.price_monthly)}/mo billed monthly
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2.5">
                        <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-2 pb-6">
                  {!user ? (
                    <Button asChild className="w-full" variant={isPopular ? 'default' : 'outline'}>
                      <Link to="/auth">Sign Up to Subscribe</Link>
                    </Button>
                  ) : isCurrent ? (
                    <Button disabled className="w-full" variant="outline">
                      Current Plan
                    </Button>
                  ) : plan.tier === 'free' ? (
                    <Button disabled className="w-full" variant="outline">
                      Free Forever
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={createCheckout.isPending}
                      className="w-full"
                      variant={isPopular ? 'default' : 'outline'}
                    >
                      {createCheckout.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {isCurrent ? 'Current Plan' : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-center mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'Can I cancel anytime?', a: "Yes! You can cancel your subscription at any time. You'll continue to have access until the end of your billing period." },
              { q: 'What payment methods do you accept?', a: 'We accept all major credit cards through Stripe, our secure payment provider.' },
              { q: 'Can I switch plans?', a: 'Absolutely! You can upgrade or downgrade your plan at any time from your account settings.' },
            ].map((item) => (
              <details key={item.q} className="group border border-border rounded-lg">
                <summary className="flex items-center justify-between p-4 cursor-pointer text-sm font-medium select-none list-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
