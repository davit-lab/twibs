import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import CommentSection from '@/components/comments/CommentSection';
import MediaLightbox from '@/components/MediaLightbox';
import RichText from '@/components/rich/RichText';
import ReportDialog from '@/components/social/ReportDialog';
import LikesDialog from '@/components/social/LikesDialog';
import { useBlockedUsers, useMutedUsers, useSavedPosts, useRepostedPosts, useSafetyActions } from '@/hooks/useSafety';
import { 
  Star, 
  MessageCircle, 
  Share2, 
  MoreHorizontal,
  Trash2,
  Flag,
  Pin,
  BadgeCheck,
  Globe,
  Users,
  Lock,
  Bookmark,
  Pencil,
  Check,
  X,
  Loader2,
  Repeat,
  Copy,
  UserX,
  VolumeX,
  Volume2,
  Megaphone,
  Info,
  MapPin,
  Calendar,
  Bot,
  ExternalLink,
  Heart,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export interface PostContextMeta {
  location?: string | null;
  source_url?: string | null;
  when?: string | null;
  is_edited?: boolean;
  is_ai_generated?: boolean;
  references?: string | null;
}

interface PostProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface PostBusinessAccount {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  account_type: string;
}

interface PostMedia {
  id: string;
  url: string;
  type: string;
  alt_text: string | null;
}

interface PostData {
  id: string;
  content: string;
  visibility: 'public' | 'followers' | 'private';
  star_count: number;
  comment_count: number;
  repost_count?: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  user_id: string;
  profiles: PostProfile;
  post_media: PostMedia[];
  business_account?: PostBusinessAccount | null;
  user_has_starred?: boolean;
  context_meta?: PostContextMeta | null;
}

export type { PostData };

interface PostCardProps {
  post: PostData;
  onPostDeleted?: () => void;
  onStarChange?: () => void;
  reposter?: ReposterProfile | null;
  defaultCommentsOpen?: boolean;
  showRecommendationInfo?: boolean;
}

interface ReposterProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

const visibilityIcons = {
  public: Globe,
  followers: Users,
  private: Lock,
};

export default function PostCard({ post, onPostDeleted, onStarChange, reposter, defaultCommentsOpen = false, showRecommendationInfo = false }: PostCardProps) {
  const { user, profile: currentUserProfile } = useAuth();
  const { preferences } = useUserPreferences();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isStarred, setIsStarred] = useState(post.user_has_starred || false);
  const [starCount, setStarCount] = useState(post.star_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [repostCount, setRepostCount] = useState(post.repost_count || 0);
  const [isStarring, setIsStarring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showComments, setShowComments] = useState(defaultCommentsOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [recommendationReasons, setRecommendationReasons] = useState<string[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [addingSignal, setAddingSignal] = useState(false);
  const [signalApplied, setSignalApplied] = useState<'less' | 'more' | null>(null);

  const { data: savedPostIds = [] } = useSavedPosts();
  const { data: repostedPostIds = [] } = useRepostedPosts();
  const { data: blockedIds = [] } = useBlockedUsers();
  const { data: mutedIds = [] } = useMutedUsers();
  const { blockUser, unblockUser, muteUser, unmuteUser, savePost, unsavePost, repostPost, unrepostPost } = useSafetyActions();

  const isOwnPost = currentUserProfile?.user_id === post.user_id;
  const isEdited = post.is_edited === true;
  const isSaved = savedPostIds.includes(post.id);
  const hasReposted = repostedPostIds.includes(post.id);
  const isBlocked = blockedIds.includes(post.user_id);
  const isMuted = mutedIds.includes(post.user_id);

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const handleStar = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to star posts.',
      });
      return;
    }

    setIsStarring(true);
    
    try {
      if (isStarred) {
        await supabase
          .from('stars')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
        
        setIsStarred(false);
        setStarCount(prev => Math.max(0, prev - 1));
      } else {
        await supabase
          .from('stars')
          .insert({
            post_id: post.id,
            user_id: user.id,
          });
        
        setIsStarred(true);
        setStarCount(prev => prev + 1);
      }
      
      onStarChange?.();
    } catch (error: unknown) {
      console.error('Star error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update star. Please try again.',
      });
    } finally {
      setIsStarring(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwnPost) return;
    
    setIsDeleting(true);
    
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      toast({
        title: 'Post deleted',
        description: 'Your post has been removed.',
      });
      
      onPostDeleted?.();
    } catch (error: unknown) {
      console.error('Delete error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete post. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = () => {
    setEditContent(post.content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('posts')
        .update({
          content: editContent.trim(),
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({
        title: 'Post updated',
        description: 'Your post has been edited.',
      });
      setIsEditing(false);
    } catch (error: unknown) {
      console.error('Edit error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to edit post. Please try again.',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleShare = async () => {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.profiles.display_name}`,
          text: post.content.slice(0, 100) + (post.content.length > 100 ? '...' : ''),
          url: postUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(postUrl);
      toast({
        title: 'Link copied!',
        description: 'Post link copied to clipboard.',
      });
    }
  };

  const handleCopyLink = async () => {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    await navigator.clipboard.writeText(postUrl);
    toast({
      title: 'Link copied!',
      description: 'Post link copied to clipboard.',
    });
  };

  const handleSave = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to save posts.',
      });
      return;
    }
    if (isSaved) {
      await unsavePost(post.id);
    } else {
      await savePost(post.id);
    }
  };

  const handleRepost = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to repost.',
      });
      return;
    }
    if (hasReposted) {
      const ok = await unrepostPost(post.id);
      if (ok) setRepostCount(prev => Math.max(0, prev - 1));
    } else {
      const ok = await repostPost(post.id);
      if (ok) setRepostCount(prev => prev + 1);
    }
  };

  const handleMute = async () => {
    if (isMuted) {
      await unmuteUser(post.user_id);
    } else {
      await muteUser(post.user_id);
    }
  };

  const handleBlock = async () => {
    if (isBlocked) {
      await unblockUser(post.user_id);
    } else {
      const ok = await blockUser(post.user_id);
      if (ok) onStarChange?.();
    }
  };

  const openRecommendation = async () => {
    setRecommendationOpen(true);
    if (recommendationReasons.length > 0) return;
    setRecommendationLoading(true);
    try {
      const reasons: string[] = [];
      if (!user) return;

      const [{ data: follow }, { data: reposts }] = await Promise.all([
        supabase
          .from('follows')
          .select('status')
          .eq('follower_id', user.id)
          .eq('following_id', post.user_id)
          .maybeSingle(),
        supabase
          .from('reposts')
          .select('user_id, profiles:user_id(username, display_name)')
          .eq('post_id', post.id)
          .limit(60),
      ]);

      const isFollowingAuthor = follow?.status === 'accepted';
      if (isFollowingAuthor) {
        reasons.push(`You follow @${post.profiles.username} — their posts show up in your feed.`);
      } else if (post.star_count > 0) {
        reasons.push(`@${post.profiles.username} is a creator this community engages with (${post.star_count} stars on this post).`);
      } else {
        reasons.push(`We think you might enjoy posts like this based on what you engage with.`);
      }

      if (reposts && reposts.length > 0) {
        const followedReposters = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'accepted');
        const followedSet = new Set((followedReposters.data || []).map((f) => f.following_id));
        const networkCount = reposts.filter((r) => followedSet.has(r.user_id)).length;
        if (networkCount > 0) {
          reasons.push(`People you follow reposted this post (${networkCount} of them).`);
        }
      }

      setRecommendationReasons(reasons);
    } catch (error) {
      console.error('Recommendation reason error:', error);
    } finally {
      setRecommendationLoading(false);
    }
  };

  const handleFeedSignal = async (signal: 'less' | 'more') => {
    if (!user || addingSignal) return;
    setAddingSignal(true);
    try {
      if (signal === 'less') {
        await supabase
          .from('feed_signals')
          .upsert({ user_id: user.id, post_id: post.id, signal: 'less' }, { onConflict: 'user_id,post_id' });
      } else {
        const { data: existing } = await supabase
          .from('feed_signals')
          .select('id')
          .eq('user_id', user.id)
          .eq('post_id', post.id)
          .maybeSingle();
        if (existing) {
          await supabase.from('feed_signals').update({ signal: 'more' }).eq('id', existing.id);
        } else {
          await supabase.from('feed_signals').insert({ user_id: user.id, post_id: post.id, signal: 'more' });
        }
      }
      setSignalApplied(signal);
      if (signal === 'less') {
        toast({ title: 'Got it', description: 'We\u2019ll show fewer posts like this in your feed.' });
      } else {
        toast({ title: 'Got it', description: 'We\u2019ll try to show more content like this.' });
      }
    } catch (error) {
      console.error('Feed signal error:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save your preference.' });
    } finally {
      setAddingSignal(false);
    }
  };

  const contextMeta = post.context_meta || null;
  const isAiGenerated = contextMeta?.is_ai_generated === true;
  const hideLikeCounts = !!preferences?.hide_like_counts && !isOwnPost;

  const VisibilityIcon = visibilityIcons[post.visibility];

  return (
    <article className={cn(
      "bg-card rounded-2xl border border-border/60 shadow-sm shadow-black/[0.03] overflow-hidden transition-all duration-200 hover:shadow-md hover:border-border/80",
      showComments && "ring-1 ring-primary/20 border-primary/20"
    )}>
      {/* Repost banner */}
      {reposter && (
        <div className="flex items-center gap-1.5 px-4 pt-3.5 text-[13px] text-muted-foreground">
          <Repeat className="h-4 w-4 flex-shrink-0" />
          <Link
            to={`/profile/${reposter.username}`}
            className="font-semibold hover:text-foreground transition-colors truncate"
          >
            {reposter.display_name}
          </Link>
          <span>reposted</span>
        </div>
      )}

      {/* Post Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {post.business_account ? (
          <Link to={`/business/${post.business_account.username}`} className="flex-shrink-0">
            <UserAvatar
              userId={post.user_id}
              avatarUrl={post.business_account.avatar_url}
              displayName={post.business_account.name}
              size="md"
            />
          </Link>
        ) : (
          <Link to={`/profile/${post.profiles.username}`} className="flex-shrink-0">
            <UserAvatar
              userId={post.user_id}
              avatarUrl={post.profiles.avatar_url}
              displayName={post.profiles.display_name}
              size="md"
            />
          </Link>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.business_account ? (
              <>
                <Link
                  to={`/business/${post.business_account.username}`}
                  className="font-semibold text-[15px] hover:text-primary transition-colors truncate"
                >
                  {post.business_account.name}
                </Link>
                <BadgeCheck className="h-[18px] w-[18px] text-primary flex-shrink-0" />
                <Store className="h-3 w-3 text-violet-500 flex-shrink-0" />
                <span className="text-muted-foreground text-sm">@{post.business_account.username}</span>
              </>
            ) : (
              <>
                <Link
                  to={`/profile/${post.profiles.username}`}
                  className="font-semibold text-[15px] hover:text-primary transition-colors truncate"
                >
                  {post.profiles.display_name}
                </Link>
                {post.profiles.is_verified && (
                  <BadgeCheck className="h-[18px] w-[18px] text-primary flex-shrink-0" />
                )}
                <span className="text-muted-foreground text-sm">@{post.profiles.username}</span>
              </>
            )}
            <span className="text-muted-foreground/50">·</span>
            <time
              dateTime={post.created_at}
              onClick={() => navigate(`/post/${post.id}`)}
              className="text-muted-foreground text-sm hover:text-foreground transition-colors cursor-pointer"
            >
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: false })}
            </time>
            {isEdited && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                edited
              </span>
            )}
            {isAiGenerated && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Bot className="h-3 w-3" />
                AI
              </span>
            )}
            <span className="p-0.5 rounded-full bg-muted/80">
              <VisibilityIcon className="h-3 w-3 text-muted-foreground/80" />
            </span>
            {showRecommendationInfo && !isOwnPost && user && (
              <button
                onClick={openRecommendation}
                title="Why am I seeing this?"
                className="p-1 rounded-full text-muted-foreground/60 hover:bg-surface-3 hover:text-primary transition-colors"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 -m-1 rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            {isOwnPost ? (
              <>
                <DropdownMenuItem className="gap-2 text-sm rounded-lg">
                  <Pin className="h-4 w-4" />
                  Pin to profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={startEditing}
                >
                  <Pencil className="h-4 w-4" />
                  Edit post
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={handleCopyLink}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/30" />
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={() => navigate(`/boost/${post.id}`)}
                >
                  <Megaphone className="h-4 w-4" />
                  Boost post
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/30" />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive text-sm rounded-lg"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete post
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={() => setReportOpen(true)}
                >
                  <Flag className="h-4 w-4" />
                  Report post
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={handleMute}
                >
                  {isMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  {isMuted ? 'Unmute @' : 'Mute @'}{post.profiles.username}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive text-sm rounded-lg"
                  onClick={handleBlock}
                >
                  {isBlocked ? <Volume2 className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                  {isBlocked ? 'Unblock @' : 'Block @'}{post.profiles.username}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/30" />
                <DropdownMenuItem
                  className="gap-2 text-sm rounded-lg"
                  onClick={handleCopyLink}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Post Content */}
      {post.content || isEditing ? (
        <div className="px-4">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                autoFocus
                placeholder="What's on your mind?"
                className="w-full bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2.5 text-[15px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  disabled={isSavingEdit}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim() || isSavingEdit}
                  className="rounded-full gap-1.5"
                >
                  {isSavingEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p
              onClick={() => navigate(`/post/${post.id}`)}
              className="text-[15px] leading-relaxed whitespace-pre-wrap break-words cursor-pointer"
            >
              <RichText text={post.content} />
            </p>
          )}
        </div>
      ) : null}

      {/* Media Grid */}
      {post.post_media && post.post_media.length > 0 && (
        <div className="px-4 mt-3">
          <div className={cn(
            "grid gap-1 rounded-2xl overflow-hidden border border-border/40",
            post.post_media.length === 1 && "grid-cols-1",
            post.post_media.length === 2 && "grid-cols-2",
            post.post_media.length >= 3 && "grid-cols-2"
          )}>
            {post.post_media.map((media, index) => (
              <div
                key={media.id}
                className={cn(
                  "relative bg-muted cursor-pointer",
                  post.post_media.length === 3 && index === 0 && "row-span-2"
                )}
              >
                {media.type === 'image' ? (
                  <button
                    onClick={() => setLightboxIndex(index)}
                    className="block w-full cursor-zoom-in"
                    aria-label="Open image"
                  >
                    <img
                      src={media.url}
                      alt={media.alt_text || 'Post image'}
                      className="w-full h-full object-cover max-h-[400px] opacity-100 transition-opacity"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <video
                    src={media.url}
                    className="w-full h-full object-cover max-h-[400px]"
                    controls
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context row */}
      {contextMeta && (contextMeta.location || contextMeta.source_url || contextMeta.when || contextMeta.is_edited || contextMeta.is_ai_generated || contextMeta.references) && (
        <div className="px-4 mt-3">
          <button
            onClick={() => setContextOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/70 border border-border/60 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Context
          </button>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 mt-3 border-t border-border/20">
        <div className="flex items-center gap-1">
          {/* Star Button */}
          <button
            onClick={handleStar}
            disabled={isStarring}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95",
              isStarred
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-3 hover:text-primary"
            )}
          >
            <Star
              className={cn(
                "h-5 w-5 transition-transform duration-200",
                isStarred && "fill-primary scale-110"
              )}
            />
          </button>

          {/* Star count -> who starred */}
          {hideLikeCounts ? (
            starCount > 0 && (
              <span className="px-1.5 py-2 text-xs font-semibold text-muted-foreground/80 inline-flex items-center gap-1 whitespace-nowrap">
                <Heart className="h-3.5 w-3.5 text-primary/70 fill-primary/40" />
                People enjoyed this
              </span>
            )
          ) : (
            starCount > 0 && (
              <LikesDialog
                postId={post.id}
                source="stars"
                title="Starred by"
                emptyLabel="No one has starred this post yet"
                signInLabel="Sign in to see who starred this post"
                trigger={
                  <button
                    className={cn(
                      "px-1.5 py-2 rounded-full text-xs tabular-nums font-semibold transition-colors hover:text-primary",
                      isStarred ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {starCount}
                  </button>
                }
              />
            )
          )}

          {/* Comment Button */}
          <button
            onClick={() => setShowComments(!showComments)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95",
              showComments
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-3 hover:text-primary"
            )}
          >
            <MessageCircle className={cn("h-5 w-5", showComments && "fill-primary/20")} />
            {commentCount > 0 && <span className="text-xs tabular-nums font-semibold">{commentCount}</span>}
          </button>

          {/* Repost Button */}
          <button
            onClick={handleRepost}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95",
              hasReposted
                ? "bg-accent/10 text-accent"
                : "text-muted-foreground hover:bg-surface-3 hover:text-accent"
            )}
          >
            <Repeat
              className={cn(
                "h-5 w-5 transition-transform duration-200",
                hasReposted && "fill-accent scale-110"
              )}
            />
            {repostCount > 0 && <span className="text-xs tabular-nums font-semibold">{repostCount}</span>}
          </button>

          {/* Share Button */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:bg-surface-3 hover:text-primary transition-all duration-200 active:scale-95"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        {/* Right Actions */}
        <button
          onClick={handleSave}
          className={cn(
            "p-2 rounded-full transition-all duration-200 active:scale-95",
            isSaved
              ? "text-primary"
              : "text-muted-foreground hover:bg-surface-3 hover:text-primary"
          )}
        >
          <Bookmark className={cn("h-5 w-5", isSaved && "fill-primary")} />
        </button>
      </div>

      {/* Comments Section */}
      <Collapsible open={showComments} onOpenChange={setShowComments}>
        <CollapsibleContent>
          <div className="px-4 pb-4">
            <CommentSection postId={post.id} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="post"
        targetId={post.id}
        targetLabel="post"
      />

      {/* Why am I seeing this? */}
      <Dialog open={recommendationOpen} onOpenChange={setRecommendationOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5 text-primary" />
              Why am I seeing this?
            </DialogTitle>
            <DialogDescription>
              A little transparency into why this post landed in your feed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            {recommendationLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recommendationReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">We could not determine a specific reason for this post.</p>
            ) : (
              recommendationReasons.map((reason, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/60">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <p className="text-sm leading-relaxed text-foreground/85">{reason}</p>
                </div>
              ))
            )}

            <div className="border-t border-border/70 pt-4 mt-2 space-y-2">
              <button
                onClick={() => handleFeedSignal('less')}
                disabled={addingSignal || signalApplied === 'less'}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all",
                  signalApplied === 'less'
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                {signalApplied === 'less' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {signalApplied === 'less' ? 'Noted — fewer posts like this' : 'Show fewer posts like this'}
              </button>
              <button
                onClick={handleMute}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border hover:border-destructive/40 hover:bg-destructive/5 transition-all"
              >
                <VolumeX className="h-4 w-4" />
                Don't recommend posts from @{post.profiles.username}
              </button>
              <button
                onClick={() => { setRecommendationOpen(false); setReportOpen(true); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-destructive border border-destructive/20 hover:bg-destructive/5 transition-all"
              >
                <Flag className="h-4 w-4" />
                Report this post
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post context */}
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              About this post
            </DialogTitle>
            <DialogDescription>
              Additional information shared by the creator.
            </DialogDescription>
          </DialogHeader>

          {contextMeta && (
            <div className="space-y-2.5 mt-1">
              {contextMeta.is_ai_generated && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Bot className="h-4 w-4 text-primary flex-shrink-0" />
                  <p className="text-sm font-medium">This post was generated with AI</p>
                </div>
              )}
              {contextMeta.is_edited && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/60">
                  <Pencil className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">The creator edited this post before publishing.</p>
                </div>
              )}
              {contextMeta.when && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/60">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">When</p>
                    <p className="text-sm font-medium">{new Date(contextMeta.when).toLocaleString()}</p>
                  </div>
                </div>
              )}
              {contextMeta.location && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/60">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Where</p>
                    <p className="text-sm font-medium">{contextMeta.location}</p>
                  </div>
                </div>
              )}
              {contextMeta.source_url && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/60">
                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={contextMeta.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate">
                    {contextMeta.source_url}
                  </a>
                </div>
              )}
              {contextMeta.references && (
                <div className="p-3 rounded-xl bg-muted/50 border border-border/60">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">References</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{contextMeta.references}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && post.post_media[lightboxIndex] && (
        <MediaLightbox
          src={post.post_media[lightboxIndex].url}
          alt={post.post_media[lightboxIndex].alt_text || 'Post photo'}
          images={post.post_media.map((m) => ({
            src: m.url,
            alt: m.alt_text || 'Post photo',
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </article>
  );
}
