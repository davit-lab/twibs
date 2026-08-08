import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestPostActions, InterestPost } from '@/hooks/useInterestPosts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import InterestPostComments from './InterestPostComments';
import LikesDialog from '@/components/social/LikesDialog';
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Trash2,
  BadgeCheck,
  Copy,
  Check,
  Twitter,
  Facebook,
  MessageSquare,
  Link as LinkIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

export default function InterestPostCard({ post }: { post: InterestPost }) {
  const { user } = useAuth();
  const { deletePost, likePost, unlikePost } = useInterestPostActions();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const category = post.interest_categories;
  const username = post.profiles?.username || '';
  const postUrl = `${window.location.origin}/profile/${username}?post=${post.id}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(postUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTwitter = () => {
    const text = post.content.slice(0, 200) + (post.content.length > 200 ? '...' : '');
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(postUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleShareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleShareWhatsApp = () => {
    const text = `${post.content.slice(0, 100)}... ${postUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleLikeToggle = () => {
    if (!user) return;
    if (post.user_has_liked) {
      unlikePost.mutate(post.id);
    } else {
      likePost.mutate(post.id);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-border/70 bg-card transition-colors hover:border-border">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/profile/${username}`}>
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback className="bg-surface-2 text-foreground font-bold">
                {post.profiles?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link to={`/profile/${username}`} className="font-bold text-[15px] hover:underline truncate">
                {post.profiles?.display_name}
              </Link>
              {post.profiles?.is_verified && (
                <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />
              )}
            </div>
            <p className="text-[13px] text-muted-foreground font-medium truncate">
              @{username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {category && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
              style={{ backgroundColor: `${category.color}18`, color: category.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          )}

          {user?.id === post.user_id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deletePost.mutate(post.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>

      {/* Media */}
      {post.media_url && (
        <div className="mt-3 rounded-xl overflow-hidden border border-border/60 bg-muted">
          {post.media_type?.startsWith('video') ? (
            <video src={post.media_url} controls className="w-full max-h-[440px] object-cover" />
          ) : (
            <img src={post.media_url} alt="" className="w-full max-h-[440px] object-cover" loading="lazy" />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/60 -mx-2">
        <button
          onClick={handleLikeToggle}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold transition-colors',
            post.user_has_liked
              ? 'text-red-500'
              : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
          )}
        >
          <Heart className={cn('h-[18px] w-[18px]', post.user_has_liked && 'fill-current')} />
        </button>

        {post.like_count > 0 && (
          <LikesDialog
            postId={post.id}
            source="interest_post_likes"
            title="Liked by"
            emptyLabel="No one has liked this post yet"
            signInLabel="Sign in to see who liked this post"
            trigger={
              <button className="px-1.5 py-1.5 rounded-full text-[13px] tabular-nums font-bold text-muted-foreground transition-colors hover:text-red-500">
                {formatCount(post.like_count)}
              </button>
            }
          />
        )}

        <button
          onClick={() => setCommentsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          {post.comment_count > 0 && formatCount(post.comment_count)}
        </button>

        <div className="flex-1" />

        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
              <Share2 className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 bg-popover border border-border" align="end">
            <div className="space-y-1">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <LinkIcon className="h-4 w-4" />
                )}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                onClick={handleShareTwitter}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                <Twitter className="h-4 w-4" />
                Share on X
              </button>
              <button
                onClick={handleShareFacebook}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                <Facebook className="h-4 w-4" />
                Share on Facebook
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Share on WhatsApp
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <InterestPostComments
        postId={post.id}
        postAuthorName={post.profiles?.display_name || ''}
        commentCount={post.comment_count}
        open={commentsOpen}
        onOpenChange={(open) => !open && setCommentsOpen(false)}
      />
    </div>
  );
}
