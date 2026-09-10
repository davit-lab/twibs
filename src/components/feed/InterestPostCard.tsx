import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestPostActions, InterestPost } from '@/hooks/useInterestPosts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import InterestPostComments from './InterestPostComments';
import LikesDialog from '@/components/social/LikesDialog';
import MediaLightbox from '@/components/MediaLightbox';
import RichText from '@/components/rich/RichText';
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
  Bookmark,
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
  const { deletePost, likePost, unlikePost, savePost, unsavePost } = useInterestPostActions();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  const handleSaveToggle = () => {
    if (!user) return;
    if (post.user_has_saved) {
      unsavePost.mutate(post.id);
    } else {
      savePost.mutate(post.id);
    }
  };

  return (
    <article className="px-4 sm:px-5 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2.5">
        <Link to={`/profile/${username}`} className="flex-shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-surface-2 text-foreground font-bold">
              {post.profiles?.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/profile/${username}`}
              className="text-[15px] font-semibold leading-tight truncate hover:underline"
            >
              {post.profiles?.display_name}
            </Link>
            {post.profiles?.is_verified && (
              <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />
            )}
          </div>
          <p className="text-[13px] text-muted-foreground truncate leading-snug">
            @{username}
            {category && (
              <>
                {' '}· <span className="font-medium text-primary">{category.name}</span>
              </>
            )}
            {' '}· {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>

        {user?.id === post.user_id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 bg-background border-border/60 p-1">
              <DropdownMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                onClick={() => deletePost.mutate(post.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      <p className="text-[15px] leading-[1.55] whitespace-pre-wrap break-words">
        <RichText text={post.content} />
      </p>

      {/* Media */}
      {post.media_url && (
        <div className="mt-3 rounded-xl overflow-hidden border border-border/50 bg-surface">
          {post.media_type?.startsWith('video') ? (
            <video src={post.media_url} controls className="w-full max-h-[440px] object-cover" />
          ) : (
            <button
              onClick={() => setLightboxOpen(true)}
              className="block w-full cursor-zoom-in"
              aria-label="Open image"
            >
              <img
                src={post.media_url}
                alt=""
                className="w-full max-h-[440px] object-cover"
                loading="lazy"
              />
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center mt-3 pt-2.5 border-t border-border/60">
        <button
          onClick={handleLikeToggle}
          className={cn(
            'flex items-center py-1.5 pr-1.5 pl-2 rounded-full transition-colors',
            post.user_has_liked
              ? 'text-red-500'
              : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-500'
          )}
          aria-label={post.user_has_liked ? 'Unlike' : 'Like'}
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
              <button className="py-1.5 px-1.5 rounded-full text-[13px] tabular-nums font-semibold text-muted-foreground transition-colors hover:text-red-500">
                {formatCount(post.like_count)}
              </button>
            }
          />
        )}

        <button
          onClick={() => setCommentsOpen((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 py-1.5 px-2.5 ml-1 rounded-full text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            commentsOpen
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
          )}
          aria-label={commentsOpen ? 'Close discussion' : 'Open discussion'}
        >
          <MessageCircle className={cn('h-[18px] w-[18px]', commentsOpen && 'fill-current')} />
          {post.comment_count > 0 ? (
            <span className="tabular-nums">{formatCount(post.comment_count)}</span>
          ) : (
            <span>Discuss</span>
          )}
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSaveToggle}
          className={cn(
            'py-1.5 px-2.5 rounded-full transition-colors',
            post.user_has_saved
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
          )}
          aria-label={post.user_has_saved ? 'Added to interests' : 'Add to interests'}
          title={post.user_has_saved ? 'Added to interests' : 'Add to interests'}
        >
          <Bookmark className={cn('h-[18px] w-[18px]', post.user_has_saved && 'fill-current')} />
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label="Share"
              className="py-1.5 px-2.5 rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Share2 className="h-[18px] w-[18px]" />
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

      {/* Discussion */}
      <AnimatePresence initial={false}>
        {commentsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-4 border-t border-border/60">
              <InterestPostComments postId={post.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {lightboxOpen && (
        <MediaLightbox
          src={post.media_url!}
          alt={post.content.slice(0, 80)}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </article>
  );
}