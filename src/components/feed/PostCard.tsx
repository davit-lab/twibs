import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface PostProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
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
  user_has_starred?: boolean;
}

export type { PostData };

interface PostCardProps {
  post: PostData;
  onPostDeleted?: () => void;
  onStarChange?: () => void;
  reposter?: ReposterProfile | null;
  defaultCommentsOpen?: boolean;
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

export default function PostCard({ post, onPostDeleted, onStarChange, reposter, defaultCommentsOpen = false }: PostCardProps) {
  const { user, profile: currentUserProfile } = useAuth();
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
        <Link to={`/profile/${post.profiles.username}`} className="flex-shrink-0">
          <UserAvatar
            userId={post.user_id}
            avatarUrl={post.profiles.avatar_url}
            displayName={post.profiles.display_name}
            size="md"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
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
            <span className="p-0.5 rounded-full bg-muted/80">
              <VisibilityIcon className="h-3 w-3 text-muted-foreground/80" />
            </span>
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
                  onClick={() => navigate(`/ads/boost/${post.id}`)}
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
          {starCount > 0 && (
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
