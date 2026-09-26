import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/contexts/BusinessContext';
import { BoostEditor } from '@/components/business/BoostEditor';
import { supabase } from '@/integrations/supabase/client';
import { Store, Plus, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BoostPostPage() {
  const { postId = '' } = useParams<{ postId: string }>();
  const { accounts, activeBusiness, mode, switchToBusiness, accountsLoading } = useBusiness();

  const { data: post, isLoading: postLoading } = useQuery<{ id: string; content: string; created_at: string; star_count: number | null; comment_count: number | null } | null>({
    queryKey: ['boost-post', postId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('posts')
        .select('id, content, created_at, star_count, comment_count')
        .eq('id', postId)
        .single();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  // Choose a business: active business first, otherwise the first account.
  const businessId = activeBusiness?.id ?? accounts[0]?.id;

  if (accountsLoading || postLoading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!post) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="font-semibold">Post not found</p>
          <p className="mt-1 text-sm text-muted-foreground">This post may have been removed.</p>
          <Button className="mt-5" asChild>
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  // No business identities yet → create one first.
  if (accounts.length === 0) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl border border-border p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-xl font-bold">Create a business first</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Promotions are run from a business identity. Set one up, then boost this post.
            </p>
            <Button className="mt-5 gap-1.5" asChild>
              <Link to="/business/create">
                <Plus className="h-4 w-4" />
                Create business
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // User is in personal mode but has businesses → prompt to switch.
  if (mode !== 'business' || !businessId) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl border border-border p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
              <Sparkles className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-xl font-bold">Boost as a business</h1>
            <p className="mt-2 text-sm text-muted-foreground">Pick which business identity should promote this post.</p>
            <div className="mx-auto mt-5 max-w-xs space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => switchToBusiness(account.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30'
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-xs font-bold">
                    {(account.name || 'B')[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{account.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{account.username}</span>
                  </span>
                  <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link to="/b" className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to business
        </Link>
        <div className="mb-5">
          <h1 className="text-xl font-bold">Boost this post</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As {activeBusiness?.name} (@{activeBusiness?.username}). Managed in{' '}
            <Link to="/b" className="text-primary hover:underline">
              Your Business
            </Link>
            .
          </p>
        </div>
        <BoostEditor businessId={businessId} initialPost={post} preselectedPostId={post.id} />
      </div>
    </MainLayout>
  );
}