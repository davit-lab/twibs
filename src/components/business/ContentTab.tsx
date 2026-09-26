import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/business/bits';
import { BadgeCheck, Megaphone, PenSquare, Star, MessageCircle, Loader2 } from 'lucide-react';

interface BusinessPost {
  id: string;
  content: string;
  created_at: string;
  star_count: number | null;
  comment_count: number | null;
  visibility: string | null;
}

export function ContentTab({ businessId }: { businessId: string }) {
  const api = useBusinessApi();
  const { data: account } = useQuery({
    queryKey: ['business', businessId, 'account'],
    queryFn: () => api.getBusinessAccounts().then((list) => list.find((a) => a.id === businessId) ?? null),
    enabled: !!businessId,
  });

  const { data: posts, isLoading } = useQuery<BusinessPost[]>({
    queryKey: ['business', businessId, 'posts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('posts')
        .select('id, content, created_at, star_count, comment_count, visibility')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as BusinessPost[]) || [];
    },
    enabled: !!businessId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 flex-shrink-0 ring-2 ring-primary/20">
            <AvatarImage src={account?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">{(account?.name || 'B')[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="flex items-center gap-1.5 font-semibold">
              {account?.name || 'Business'}
              {account && <BadgeCheck className="h-4 w-4 fill-primary text-background" />}
            </p>
            <p className="text-sm text-muted-foreground">@{account?.username}</p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="hidden sm:block">Switch to this business and post from your home feed to add content here.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading posts…
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-2.5">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-border p-4 transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-3 text-sm flex-1">{post.content || 'No text'}</p>
                <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {post.visibility || 'public'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" /> {post.star_count ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count ?? 0}
                  </span>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" asChild className="gap-1.5">
                    <Link to={`/post/${post.id}`}>
                      <PenSquare className="h-3.5 w-3.5" /> View
                    </Link>
                  </Button>
                  <Button size="sm" className="gap-1.5">
                    <Link to={`/boost/${post.id}`} className="flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5" /> Boost
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No posts yet"
          description="Publish posts while acting as this business and they'll show up here, ready to boost."
          action={
            <Button asChild className="gap-1.5">
              <Link to="/">
                <PenSquare className="h-4 w-4" />
                Start posting
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}