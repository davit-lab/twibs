import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReelComments, ReelComment } from '@/hooks/useReels';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, Send, Loader2, X, ChevronDown, ChevronUp, Pin, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import GifPicker from '../messaging/GifPicker';
import defaultAvatar from '@/assets/default-avatar.png';

const QUICK_EMOJIS = ['😍', '🔥', '😂', '😮', '👍', '😢', '👏'];

const isGifUrl = (content: string) => {
  const trimmed = content.trim();
  return (
    trimmed.match(/^https?:\/\/.*\.(gif)(\?.*)?$/i) ||
    trimmed.includes('giphy.com') ||
    trimmed.includes('tenor.com')
  );
};

interface ReelCommentsSheetProps {
  reelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReelCommentsSheet({ reelId, open, onOpenChange }: ReelCommentsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0 border-white/10 bg-zinc-950">
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-white/10">
          <SheetTitle className="text-white text-center">Comments</SheetTitle>
        </SheetHeader>
        {reelId && <CommentsContent reelId={reelId} />}
      </SheetContent>
    </Sheet>
  );
}

function CommentItem({ comment, onLike, onReply, animatingHearts, isReply = false, pinned = false }: {
  comment: ReelComment;
  onLike: (id: string) => void;
  onReply: (id: string, username: string) => void;
  animatingHearts: Set<string>;
  isReply?: boolean;
  pinned?: boolean;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className={cn(isReply && "ml-10 mt-3")}>
      <div className="flex gap-3">
        <Link to={`/profile/${comment.profile?.username}`} className="flex-shrink-0">
          <Avatar className={cn(isReply ? "h-8 w-8" : "h-11 w-11")}>
            <AvatarImage src={comment.profile?.avatar_url || defaultAvatar} className="object-cover" />
            <AvatarFallback className="bg-neutral-800 text-white text-sm">
              {comment.profile?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          {pinned && (
            <div className="mb-1 flex items-center gap-1.5">
              <Pin className="h-3 w-3 text-white/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Pinned</span>
            </div>
          )}
          <div className="flex items-center gap-2 mb-0.5">
            <Link to={`/profile/${comment.profile?.username}`} className={cn("font-semibold text-white hover:underline", isReply ? "text-xs" : "text-sm")}>
              {comment.profile?.display_name}
            </Link>
            <span className="text-white/30 text-xs">{format(new Date(comment.created_at), 'MMM d')}</span>
          </div>
          {isGifUrl(comment.content) ? (
            <img
              src={comment.content.trim()}
              alt="GIF"
              loading="lazy"
              className="mt-1 max-h-64 w-full max-w-xs rounded-xl object-contain"
            />
          ) : (
            <p className={cn("text-white/80 leading-relaxed", isReply ? "text-sm" : "text-[15px]")}>{comment.content}</p>
          )}
          <div className="flex items-center gap-5 mt-2">
            <button onClick={() => onLike(comment.id)} className="flex items-center gap-1.5 group">
              <Heart className={cn("h-4 w-4 transition-all duration-200", comment.is_liked ? "text-red-500 fill-red-500" : "text-white/40 group-hover:text-red-400")} />
              {comment.like_count > 0 && (
                <span className={cn("text-xs tabular-nums", comment.is_liked ? "text-red-400" : "text-white/40")}>{comment.like_count}</span>
              )}
            </button>
            <button onClick={() => onReply(comment.id, comment.profile?.username || 'User')} className="text-xs text-white/40 hover:text-white/70 font-medium">Reply</button>
          </div>

          {hasReplies && !isReply && (
            <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1.5 mt-3 text-xs text-primary/80 hover:text-primary font-medium">
              <div className="w-6 h-px bg-white/20" />
              {showReplies ? <><ChevronUp className="h-3 w-3" /> Hide replies</> : <><ChevronDown className="h-3 w-3" /> View {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}</>}
            </button>
          )}
        </div>
      </div>

      {hasReplies && showReplies && (
        <div className="space-y-3 mt-3">
          {comment.replies!.map(reply => (
            <CommentItem key={reply.id} comment={reply} onLike={onLike} onReply={onReply} animatingHearts={animatingHearts} isReply />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentsContent({ reelId }: { reelId: string }) {
  const { user } = useAuth();
  const { comments, loading, addComment, likeComment } = useReelComments(reelId);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [animatingHearts, setAnimatingHearts] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;
    setSending(true);
    try {
      await addComment(newComment, replyingTo?.id);
      setNewComment('');
      setReplyingTo(null);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to post comment' });
    } finally {
      setSending(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!user) return;
    setAnimatingHearts(prev => new Set(prev).add(commentId));
    setTimeout(() => setAnimatingHearts(prev => { const n = new Set(prev); n.delete(commentId); return n; }), 400);
    await likeComment(commentId);
  };

  const handleGifSelect = async (gifUrl: string) => {
    setShowGifPicker(false);
    if (!user) return;
    setSending(true);
    try {
      await addComment(gifUrl, replyingTo?.id);
      setReplyingTo(null);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to post GIF' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-[60vh]">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
      </div>
    );
  }

  const featured = comments.length > 0
    ? [...comments].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))[0]
    : null;
  const showPinned = featured && (featured.like_count ?? 0) > 0 && comments.length > 1;
  const remaining = showPinned ? comments.filter(c => c.id !== featured.id) : comments;

  const appendEmoji = (emoji: string) => {
    setNewComment(prev => (prev ? prev.trimEnd() + ' ' : '') + emoji);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-[calc(80vh-60px)]">
      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="px-5 py-4">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageCircle className="h-12 w-12 text-white/20 mb-4" />
              <p className="text-white font-medium">No comments yet</p>
              <p className="text-white/40 text-sm mt-1">Be the first to share your thoughts</p>
            </div>
          ) : (
            <div className="space-y-5">
              {showPinned && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Pin className="h-3 w-3 text-white/40" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Top comment</span>
                  </div>
                  <CommentItem comment={featured} onLike={handleLike} onReply={(id, username) => { setReplyingTo({ id, username }); inputRef.current?.focus(); }} animatingHearts={animatingHearts} pinned />
                </div>
              )}
              {remaining.map(comment => (
                <CommentItem key={comment.id} comment={comment} onLike={handleLike} onReply={(id, username) => { setReplyingTo({ id, username }); inputRef.current?.focus(); }} animatingHearts={animatingHearts} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {user ? (
        <div className="border-t border-white/10 bg-black/80">
          {replyingTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
              <span className="text-xs text-white/60">Replying to <span className="text-primary font-medium">@{replyingTo.username}</span></span>
              <button onClick={() => { setReplyingTo(null); setNewComment(''); }} className="text-white/40 hover:text-white/70"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex gap-1.5 px-4 pt-3 pb-1 overflow-x-auto scrollbar-hide">
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => appendEmoji(emoji)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-lg transition-all hover:bg-white/15 hover:scale-110 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="relative flex items-center gap-3 p-4 pt-2">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={user.user_metadata?.avatar_url || defaultAvatar} className="object-cover" />
              <AvatarFallback className="bg-neutral-800 text-white text-xs">{user.user_metadata?.display_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <input
              ref={inputRef}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
              className="flex-1 bg-white/10 text-white placeholder:text-white/30 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="button"
              onClick={() => setShowGifPicker(!showGifPicker)}
              aria-label="Add GIF"
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-90",
                showGifPicker ? "bg-white/20 text-white" : "bg-white/10 text-white/50 hover:bg-white/15 hover:text-white"
              )}
            >
              <ImageIcon className="h-5 w-5" />
            </button>
            <Button type="submit" size="icon" disabled={!newComment.trim() || sending}
              className={cn("rounded-full h-10 w-10 flex-shrink-0", newComment.trim() ? "bg-primary text-white" : "bg-white/10 text-white/30")}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            {showGifPicker && (
              <GifPicker
                onSelect={handleGifSelect}
                onClose={() => setShowGifPicker(false)}
              />
            )}
          </form>
        </div>
      ) : (
        <div className="p-4 border-t border-white/10 text-center bg-black/80">
          <Link to="/auth">
            <Button variant="outline" className="rounded-full px-8 border-white/20 text-white hover:bg-white/10">Sign in to comment</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
