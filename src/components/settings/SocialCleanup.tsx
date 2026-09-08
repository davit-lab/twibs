import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  UserX,
  Users,
  Archive,
  MessageSquare,
  Star,
  Loader2,
  RefreshCw,
  Sparkles,
  BadgeCheck,
  Trash2,
  Mail,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FollowItem {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

interface FollowBackItem {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  last_seen_at: string | null;
  follows_back: boolean;
}

interface PostItem {
  post_id: string;
  content: string;
  created_at: string;
  star_count: number | null;
  comment_count: number | null;
}

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  post_id: string;
}

interface ConversationItem {
  conversation_id: string;
  last_read_at: string | null;
  name: string | null;
  avatar_url: string | null;
}

const CLEANUP_YEARS = 1;
const STALE_MONTHS = 6;
const INACTIVE_MONTHS = 8;
const LIMIT = 15;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

function SectionCard({
  title,
  description,
  icon,
  count,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-accent/60 flex items-center justify-center text-accent shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm sm:text-base">{title}</h3>
            <Badge variant={count > 0 ? 'default' : 'secondary'}>{count}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-4 bg-muted/40 rounded-xl">
      <Sparkles className="h-4 w-4 inline -mt-0.5 mr-1" />
      {label}
    </p>
  );
}

function PersonRow({
  name,
  username,
  avatar,
  verified,
  meta,
  actions,
}: {
  name: string | null;
  username: string;
  avatar: string | null;
  verified: boolean | null;
  meta: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={avatar || undefined} />
        <AvatarFallback className="bg-muted text-xs font-semibold">
          {name?.slice(0, 2).toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium flex items-center gap-1 truncate">
          {name || username}
          {verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
        </p>
        <p className="text-xs text-muted-foreground truncate">@{username} · {meta}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
    </div>
  );
}

export default function SocialCleanupSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [notFollowingBack, setNotFollowingBack] = useState<FollowItem[]>([]);
  const [inactiveFollowers, setInactiveFollowers] = useState<FollowBackItem[]>([]);
  const [oldPosts, setOldPosts] = useState<PostItem[]>([]);
  const [oldComments, setOldComments] = useState<CommentItem[]>([]);
  const [oldStars, setOldStars] = useState<{ post_id: string; created_at: string }[]>([]);
  const [staleConvos, setStaleConvos] = useState<ConversationItem[]>([]);

  const [pendingAction, setPendingAction] = useState<{ kind: string; label: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCleanup = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const postCutoff = daysAgo(365 * CLEANUP_YEARS);
    const convoCutoff = daysAgo(30 * STALE_MONTHS);
    const inactiveCutoff = daysAgo(30 * INACTIVE_MONTHS);

    const [followedRes, followersRes, postsRes, commentsRes, starsRes, convoRes] = await Promise.all([
      // People I follow
      supabase
        .from('follows')
        .select('following_id, profiles:following_id(username, display_name, avatar_url, is_verified)')
        .eq('follower_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(200),
      // My followers
      supabase
        .from('follows')
        .select('follower_id, created_at')
        .eq('following_id', user.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(200),
      // My old posts
      supabase
        .from('posts')
        .select('id, content, created_at, star_count, comment_count')
        .eq('user_id', user.id)
        .eq('hidden', false)
        .lt('created_at', postCutoff)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      // My old comments
      supabase
        .from('comments')
        .select('id, content, created_at, post_id')
        .eq('user_id', user.id)
        .eq('hidden', false)
        .lt('created_at', postCutoff)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      // My old stars
      supabase
        .from('stars')
        .select('post_id, created_at')
        .eq('user_id', user.id)
        .lt('created_at', postCutoff)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      // Conversations I haven't opened in a while
      supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at, conversations:conversation_id(type, name, avatar_url)')
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: true })
        .limit(30),
    ]);

    // Not-following-back: intersect with accepted follows back.
    const followed = (followedRes.data || []).map((row: any) => ({
      user_id: row.following_id,
      username: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.username,
      display_name: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name,
      avatar_url: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.avatar_url,
      is_verified: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.is_verified,
    }));
    const followedIds = followed.map((f) => f.user_id);
    let mutualIds = new Set<string>();
    if (followedIds.length > 0) {
      const mutualRes = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', user.id)
        .eq('status', 'accepted')
        .in('follower_id', followedIds)
        .limit(1000);
      mutualIds = new Set((mutualRes.data || []).map((m) => m.follower_id));
    }
    const notBack = followed.filter((f) => !mutualIds.has(f.user_id)).slice(0, LIMIT);
    setNotFollowingBack(notBack);

    // Inactive followers: profile data + activity date.
    const followerIds = (followersRes.data || []).map((f) => f.follower_id);
    if (followerIds.length > 0) {
      const profilesRes = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified, last_seen_at')
        .in('user_id', followerIds)
        .limit(1000);
      const byId = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const inactive = (followersRes.data || [])
        .map((f) => {
          const p = byId.get(f.follower_id);
          const inactive = !p?.last_seen_at || p.last_seen_at < inactiveCutoff;
          return {
            user_id: f.follower_id,
            username: p?.username || 'unknown',
            display_name: p?.display_name || null,
            avatar_url: p?.avatar_url || null,
            is_verified: p?.is_verified ?? false,
            last_seen_at: p?.last_seen_at || null,
            follows_back: true,
          };
        })
        .filter((f) => f.last_seen_at === null || f.last_seen_at < inactiveCutoff)
        .slice(0, LIMIT);
      setInactiveFollowers(inactive);
    } else {
      setInactiveFollowers([]);
    }

    setOldPosts((postsRes.data || []).map((p: any) => ({
      post_id: p.id,
      content: p.content,
      created_at: p.created_at,
      star_count: p.star_count,
      comment_count: p.comment_count,
    })));
    setOldComments((commentsRes.data || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      post_id: c.post_id,
    })));
    setOldStars((starsRes.data || []).map((s: any) => ({ post_id: s.post_id, created_at: s.created_at })));

    // Direct conversations I haven't opened in 6+ months.
    const stale = (convoRes.data || [])
      .map((row: any) => {
        const convo = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
        return {
          conversation_id: row.conversation_id,
          last_read_at: row.last_read_at,
          name: convo?.name || null,
          avatar_url: convo?.avatar_url || null,
          type: convo?.type,
        };
      })
      .filter((c: any) => c.type === 'direct' && (!c.last_read_at || c.last_read_at < convoCutoff))
      .slice(0, LIMIT);
    setStaleConvos(stale);

    setLoading(false);

    if (followedRes.error || followersRes.error) console.error('Cleanup follow errors:', followedRes.error, followersRes.error);
  }, [user]);

  useEffect(() => {
    loadCleanup();
  }, [loadCleanup]);

  const total = useMemo(
    () => notFollowingBack.length + inactiveFollowers.length + oldPosts.length + oldComments.length + oldStars.length + staleConvos.length,
    [notFollowingBack, inactiveFollowers, oldPosts, oldComments, oldStars, staleConvos]
  );

  const runAction = async (
    key: string,
    action: () => any,
    successMsg: string
  ) => {
    if (busyId) return;
    try {
      setBusyId(key);
      const { error } = await action();
      if (error) throw error;
      toast({ description: successMsg });
    } catch (e: any) {
      toast({ variant: 'destructive', description: e?.message || 'Something went wrong' });
    } finally {
      setBusyId(null);
    }
  };

  // Remove a person from follows (unfollow)
  const unfollow = async (u: FollowItem) => {
    await runAction(
      `unfollow-${u.user_id}`,
      () => supabase.from('follows').delete().eq('follower_id', user!.id).eq('following_id', u.user_id),
      'Unfollowed @' + u.username
    );
    setNotFollowingBack((prev) => prev.filter((p) => p.user_id !== u.user_id));
  };

  // Remove an inactive follower via block RPC.
  const removeFollower = (u: FollowBackItem) => {
    setPendingAction({
      kind: `block-${u.user_id}`,
      label: `Block @${u.username}? They'll stop seeing your profile and can't follow you again.`,
    });
  };

  const archivePost = async (p: PostItem) => {
    await runAction(
      `archive-${p.post_id}`,
      () => supabase.from('posts').update({ hidden: true }).eq('id', p.post_id),
      'Post archived'
    );
    setOldPosts((prev) => prev.filter((x) => x.post_id !== p.post_id));
  };

  const deletePost = (p: PostItem) => {
    setPendingAction({
      kind: `post-${p.post_id}`,
      label: 'Delete this post permanently? This can\u2019t be undone.',
    });
  };

  const deleteComment = async (c: CommentItem) => {
    await runAction(
      `comment-${c.id}`,
      () => supabase.from('comments').delete().eq('id', c.id),
      'Comment deleted'
    );
    setOldComments((prev) => prev.filter((x) => x.id !== c.id));
  };

  const removeStar = async (p: { post_id: string }) => {
    await runAction(
      `star-${p.post_id}`,
      () => supabase.from('stars').delete().eq('user_id', user!.id).eq('post_id', p.post_id),
      'Star removed'
    );
    setOldStars((prev) => prev.filter((x) => x.post_id !== p.post_id));
  };

  const deleteConvo = (c: ConversationItem) => {
    setPendingAction({
      kind: `convo-${c.conversation_id}`,
      label: 'Delete this conversation? This can\u2019t be undone.',
    });
  };

  const confirmPending = async () => {
    if (!pendingAction) return;
    const { kind } = pendingAction;

    if (kind.startsWith('block-')) {
      const id = kind.replace('block-', '');
      await runAction(kind, () => supabase.rpc('block_user', { target_user_id: id }), 'Follower removed');
      setInactiveFollowers((prev) => prev.filter((x) => x.user_id !== id));
    } else if (kind.startsWith('post-')) {
      const id = kind.replace('post-', '');
      await runAction(kind, () => supabase.from('posts').delete().eq('id', id), 'Post deleted');
      setOldPosts((prev) => prev.filter((x) => x.post_id !== id));
    } else if (kind.startsWith('convo-')) {
      const id = kind.replace('convo-', '');
      await runAction(kind, () => supabase.rpc('delete_conversation', { conv_id: id }), 'Conversation deleted');
      setStaleConvos((prev) => prev.filter((x) => x.conversation_id !== id));
    }
    setPendingAction(null);
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Social Cleanup Day</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Stale, empty and inactive — tidy up your profile in a few taps.
        </p>
      </div>

      {/* Summary strip */}
      <div className="rounded-2xl bg-accent/60 border border-accent/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent" />
          {total > 0 ? (
            <span>
              <span className="font-bold">{total}</span> things found to clean up
            </span>
          ) : (
            <span>Your profile is all caught up</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={loadCleanup}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <SectionCard
            title="People you follow who don't follow back"
            description="Unfollow to keep your feed intentional."
            icon={<Users className="h-4 w-4" />}
            count={notFollowingBack.length}
          >
            {notFollowingBack.length === 0 ? (
              <EmptyState label="Everyone you follow follows you back." />
            ) : (
              <div>
                {notFollowingBack.map((u) => (
                  <PersonRow
                    key={u.user_id}
                    name={u.display_name}
                    username={u.username}
                    avatar={u.avatar_url}
                    verified={u.is_verified}
                    meta="Doesn't follow you"
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground gap-1.5"
                        onClick={() => unfollow(u)}
                        disabled={busyId === `unfollow-${u.user_id}`}
                      >
                        {busyId === `unfollow-${u.user_id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserX className="h-3.5 w-3.5" />
                        )}
                        Unfollow
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Inactive followers"
            description="People who haven't been active for months."
            icon={<Users className="h-4 w-4" />}
            count={inactiveFollowers.length}
          >
            {inactiveFollowers.length === 0 ? (
              <EmptyState label="Everyone who follows you has been active recently." />
            ) : (
              <div>
                {inactiveFollowers.map((u) => (
                  <PersonRow
                    key={u.user_id}
                    name={u.display_name}
                    username={u.username}
                    avatar={u.avatar_url}
                    verified={u.is_verified}
                    meta={u.last_seen_at ? `Last seen ${formatDistanceToNow(new Date(u.last_seen_at), { addSuffix: true })}` : 'No recent activity'}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-muted-foreground gap-1.5"
                        onClick={() => removeFollower(u)}
                        disabled={busyId === `block-${u.user_id}`}
                      >
                        {busyId === `block-${u.user_id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserX className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Your posts from a year ago"
            description="Archive keeps the thread, hiding it from your profile and feeds."
            icon={<Archive className="h-4 w-4" />}
            count={oldPosts.length}
          >
            {oldPosts.length === 0 ? (
              <EmptyState label="No posts from the past year to clean up." />
            ) : (
              <div>
                {oldPosts.map((p) => (
                  <div key={p.post_id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">
                        {p.content || '(photo post)'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })} · {p.star_count || 0} stars
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-muted-foreground gap-1.5" onClick={() => archivePost(p)} disabled={busyId === `archive-${p.post_id}`}>
                        {busyId === `archive-${p.post_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                        Archive
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-destructive gap-1.5" onClick={() => deletePost(p)} disabled={busyId === `post-${p.post_id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Old comments"
            description="Comments on posts older than a year."
            icon={<MessageSquare className="h-4 w-4" />}
            count={oldComments.length}
          >
            {oldComments.length === 0 ? (
              <EmptyState label="No old comments to clean up." />
            ) : (
              <div>
                {oldComments.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <Link to={`/post/${c.post_id}`} className="text-sm text-muted-foreground truncate hover:text-foreground transition-colors block">
                        {c.content}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
                    </div>
                    <div className="shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-destructive gap-1.5" onClick={() => deleteComment(c)} disabled={busyId === `comment-${c.id}`}>
                        {busyId === `comment-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Old stars"
            description="Stars you left more than a year ago."
            icon={<Star className="h-4 w-4" />}
            count={oldStars.length}
          >
            {oldStars.length === 0 ? (
              <EmptyState label="No old stars to clean up." />
            ) : (
              <div>
                {oldStars.map((s) => (
                  <div key={s.post_id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <Link to={`/post/${s.post_id}`} className="text-sm font-medium truncate hover:text-foreground transition-colors">
                        A post you starred ({formatDistanceToNow(new Date(s.created_at), { addSuffix: true })})
                      </Link>
                    </div>
                    <div className="shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-destructive gap-1.5" onClick={() => removeStar(s)} disabled={busyId === `star-${s.post_id}`}>
                        {busyId === `star-${s.post_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Conversations you haven't opened"
            description={`Direct chats with no activity for ${STALE_MONTHS}+ months.`}
            icon={<Mail className="h-4 w-4" />}
            count={staleConvos.length}
          >
            {staleConvos.length === 0 ? (
              <EmptyState label="No stale conversations." />
            ) : (
              <div>
                {staleConvos.map((c) => (
                  <div key={c.conversation_id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name || 'Conversation'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.last_read_at ? `Last opened ${formatDistanceToNow(new Date(c.last_read_at), { addSuffix: true })}` : 'Never opened'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-destructive gap-1.5" onClick={() => deleteConvo(c)} disabled={busyId === `convo-${c.conversation_id}`}>
                        {busyId === `convo-${c.conversation_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              This action can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmPending}>
              Yes, do it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}