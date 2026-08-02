import { Link } from 'react-router-dom';
import { useAuthorEarnings, useStripeConnectStatus, useCreateConnectAccount } from '@/hooks/useBookPurchase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Loader2
} from 'lucide-react';

export default function AuthorEarningsCard() {
  const { data: earnings, isLoading: earningsLoading } = useAuthorEarnings();
  const { data: connectStatus, isLoading: connectLoading } = useStripeConnectStatus();
  const createConnect = useCreateConnectAccount();

  const formatCurrency = (cents: number) => {
    return (cents / 100).toFixed(2);
  };

  const isLoading = earningsLoading || connectLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Author Earnings
        </CardTitle>
        <CardDescription>
          Manage your book sales and payouts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stripe Connect Status */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Payment Account</span>
            {connectStatus?.chargesEnabled ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : connectStatus?.hasAccount ? (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />
                Setup Incomplete
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>

          {!connectStatus?.chargesEnabled && (
            <div className="text-sm text-muted-foreground">
              {connectStatus?.hasAccount
                ? 'Complete your Stripe account setup to start receiving payments for book sales.'
                : 'Connect a Stripe account to receive payments when readers buy your books. You keep 80% of each sale.'}
            </div>
          )}

          {!connectStatus?.chargesEnabled && (
            <Button 
              onClick={() => createConnect.mutate()} 
              disabled={createConnect.isPending}
              className="w-full"
            >
              {createConnect.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {connectStatus?.hasAccount ? 'Complete Setup' : 'Connect Stripe Account'}
                </>
              )}
            </Button>
          )}

          {connectStatus?.chargesEnabled && (
            <Button 
              variant="outline" 
              onClick={() => createConnect.mutate()}
              disabled={createConnect.isPending}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Stripe Account
            </Button>
          )}
        </div>

        {/* Earnings Stats */}
        {earnings && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm mb-1">
                <ShoppingBag className="h-4 w-4" />
                Total Sales
              </div>
              <div className="text-2xl font-bold">{earnings.total_sales}</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Your Earnings
              </div>
              <div className="text-2xl font-bold text-green-600">
                ${formatCurrency(earnings.total_author_earnings)}
              </div>
            </div>
          </div>
        )}

        {!earnings && connectStatus?.chargesEnabled && (
          <div className="text-center py-6 text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No sales yet</p>
            <p className="text-sm">Start selling books to see your earnings here</p>
          </div>
        )}

        {earnings && earnings.total_sales > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            Platform fee: 20% · Total revenue: ${formatCurrency(earnings.total_revenue)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
