import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PostCard, { PostData } from '@/components/feed/PostCard';
import { Loader2, FileQuestion, ArrowLeft } from 'lucide-react';

const POST_SELECT = `
  id,
  content,
  visibility,
  star_count,
  comment_count,
  repost_count,
  is_pinned,
  created_at,
  updated_at,
  is_edited,
  user_id,
  profiles!inner (
    username,
    display_name,
    avatar_url,
    is_verified
  ),
  post_media (
    id,
    url,
    type,
    alt_text
  )
`;

export default function PostShare() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!postId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', postId)
        .eq('hidden', false)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      let resolved: PostData = {
        ...(data as PostData),
        profiles: Array.isArray((data as any).profiles)
          ? (data as any).profiles[0]
          : (data as any).profiles,
        post_media: (data as any).post_media || [],
      };

      // Annotate with the current user's star state
      if (user) {
        const { data: stars } = await supabase
          .from('stars')
          .select('post_id')
          .eq('user_id', user.id)
          .eq('post_id', postId);
        resolved = {
          ...resolved,
          user_has_starred: (stars?.length || 0) > 0,
        };
      }

      setPost(resolved);
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }, [postId, user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">Post</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        ) : notFound || !post ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
              <FileQuestion className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">Post not found</h2>
            <p className="text-muted-foreground text-sm mb-6">
              This post doesn't exist or may have been removed.
            </p>
            <Button onClick={() => navigate('/')} className="px-6">
              Back to Home
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <PostCard
              post={post}
              defaultCommentsOpen
              onStarChange={load}
              onPostDeleted={() => navigate('/')}
            />
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">
                Back to Home
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
