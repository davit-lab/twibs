import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, Share2, MoreHorizontal, Trash2, BadgeCheck, Loader2, Check, Twitter, Facebook, MessageSquare, Copy, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupActions, GroupPost } from '@/hooks/useGroups';
import { useToast } from '@/hooks/use-toast';
import GroupPostComments from './GroupPostComments';
import MediaLightbox from '@/components/MediaLightbox';
import { cn } from '@/lib/utils';
import { buildDmUrl, snippet } from '@/lib/dm';

interface GroupPostCardProps {
  post: GroupPost;
  groupName: string;
}

export default function GroupPostCard({ post, groupName }: GroupPostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { deletePost, likePost, unlikePost } = useGroupActions();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleLike = async () => {
    if (!user) return;
    if (post.user_has_liked) await unlikePost.mutateAsync(post.id);
    else await likePost.mutateAsync(post.id);
  };

  const getPostUrl = () => {
    const group = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${window.location.origin}/groups/${group}?post=${post.id}`;
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(getPostUrl());
    setCopied(true);
    toast({ title: 'Link copied!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const openShare = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  const shareUrl = encodeURIComponent(getPostUrl());
  const shareText = encodeURIComponent(post.content.slice(0, 100));

  return (
    <article className="p-4 sm:p-5 rounded-2xl bg-card border border-border/60">
      {/* Header */}
      <header className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/profile/${post.profiles?.username}`} className="flex-shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback className="bg-surface-2 text-foreground font-bold">
                {post.profiles?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link to={`/profile/${post.profiles?.username}`} className="font-black truncate hover:text-primary transition-colors">
                {post.profiles?.display_name}
              </Link>
              {post.profiles?.is_verified && <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
              @{post.profiles?.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

        {user?.id === post.user_id ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => deletePost.mutate(post.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : user ? (
          <button
            onClick={() =>
              navigate(
                buildDmUrl(
                  post.user_id,
                  post.profiles?.username || '',
                  `your post in ${groupName}: ${snippet(post.content, 48)}`
                )
              )
            }
            title={`Message ${post.profiles?.display_name}`}
            className="flex items-center gap-1.5 h-8 px-2.5 flex-shrink-0 rounded-lg text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-primary hover:bg-primary/5 border border-border/50 hover:border-primary/30 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Message
          </button>
        ) : null}
      </header>

      {/* Content */}
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</p>

      {post.media_url && (
        <figure className="mt-3 rounded-xl overflow-hidden bg-muted ring-1 ring-border/60">
          {post.media_type?.startsWith('video') ? (
            <video src={post.media_url} controls className="w-full max-h-96 object-cover" />
          ) : (
            <button
              onClick={() => setLightboxOpen(true)}
              className="block w-full cursor-zoom-in"
            >
              <img src={post.media_url} alt="" className="w-full max-h-[420px] object-cover" loading="lazy" />
            </button>
          )}
        </figure>
      )}

      {/* Actions */}
      <div className="grid grid-cols-3 gap-1 mt-4 pt-3 border-t border-border/50">
        <button
          onClick={handleLike}
          disabled={!user}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-colors',
            post.user_has_liked
              ? 'text-red-500'
              : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/5'
          )}
        >
          <Heart className={cn('h-[18px] w-[18px]', post.user_has_liked && 'fill-current')} />
          <span className="font-mono text-xs">{post.like_count}</span>
        </button>
        <button
          onClick={() => setCommentsOpen(true)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          <span className="font-mono text-xs">{post.comment_count}</span>
        </button>

        <Popover open={shareOpen} onOpenChange={setShareOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors">
              <Share2 className="h-[18px] w-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 bg-popover border border-border" align="start">
            <div className="space-y-1">
              <button onClick={copyLink} className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button onClick={() => openShare(`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`)} className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors">
                <Twitter className="h-4 w-4" />
                Share on X
              </button>
              <button onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`)} className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors">
                <Facebook className="h-4 w-4" />
                Share on Facebook
              </button>
              <button onClick={() => openShare(`https://wa.me/?text=${encodeURIComponent(post.content.slice(0, 100))} ${shareUrl}`)} className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors">
                <MessageSquare className="h-4 w-4" />
                Share on WhatsApp
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {deletePost.isPending && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Deleting...
        </p>
      )}

      <GroupPostComments
        postId={post.id}
        commentCount={post.comment_count}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />

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
