import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Star,
  MessageCircle, 
  MoreHorizontal, 
  Trash2,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Send,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Comment } from '@/hooks/useComments';
import defaultAvatar from '@/assets/default-avatar.png';

interface CommentItemProps {
  comment: Comment;
  onVote: (commentId: string, voteType: 'up' | 'down') => void;
  onReply: (content: string, parentId: string) => Promise<any>;
  onDelete: (commentId: string) => Promise<boolean>;
  depth?: number;
}

export default function CommentItem({ 
  comment, 
  onVote, 
  onReply, 
  onDelete,
  depth = 0 
}: CommentItemProps) {
  const { user, profile: currentUserProfile } = useAuth();
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2);

  const isOwnComment = currentUserProfile?.user_id === comment.user_id;
  const voteScore = comment.upvote_count - comment.downvote_count;
  const maxDepth = 3;
  const hasReplies = comment.replies && comment.replies.length > 0;

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;
    
    setIsSubmitting(true);
    const result = await onReply(replyContent.trim(), comment.id);
    if (result) {
      setReplyContent('');
      setIsReplying(false);
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
  };

  return (
    <div className={cn("group", depth > 0 && "ml-10 mt-2")}>
      <div className="flex gap-2">
        <Link to={`/profile/${comment.profiles.username}`} className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={comment.profiles.avatar_url || defaultAvatar} />
            <AvatarFallback className="bg-muted text-xs">
              {comment.profiles.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="bg-muted/40 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link 
                to={`/profile/${comment.profiles.username}`}
                className="font-semibold text-sm hover:underline"
              >
                {comment.profiles.display_name}
              </Link>
              {comment.profiles.is_verified && (
                <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <p className="text-sm text-foreground/90 mt-0.5 break-words">
              {comment.content}
            </p>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-1 ml-2">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: false })}
            </span>
            
            {/* Vote button */}
            <button
              onClick={() => onVote(comment.id, 'up')}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                comment.user_vote === 'up' ? "text-star" : "text-muted-foreground hover:text-star"
              )}
            >
              <Star className={cn("h-3.5 w-3.5", comment.user_vote === 'up' && "fill-star")} />
              {voteScore > 0 && <span>{voteScore}</span>}
            </button>

            {/* Reply button */}
            {depth < maxDepth && user && (
              <button
                onClick={() => setIsReplying(!isReplying)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Reply
              </button>
            )}

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32 bg-card border-border">
                {isOwnComment ? (
                  <DropdownMenuItem 
                    className="gap-2 text-destructive focus:text-destructive text-xs"
                    onClick={() => onDelete(comment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="gap-2 text-xs">
                    Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="flex gap-2 items-center mt-2 ml-2">
              <input
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Reply to ${comment.profiles.display_name}...`}
                autoFocus
                className="flex-1 bg-muted/50 border border-border/50 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim() || isSubmitting}
                className="h-7 w-7 rounded-full text-primary hover:bg-primary/10 disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setIsReplying(false); setReplyContent(''); }}
                className="h-7 w-7 rounded-full text-muted-foreground"
              >
                ×
              </Button>
            </div>
          )}

          {/* Show/hide replies toggle */}
          {hasReplies && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 ml-2"
            >
              {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showReplies ? 'Hide' : 'View'} {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {hasReplies && showReplies && (
        <div className="mt-1">
          {comment.replies!.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onVote={onVote}
              onReply={onReply}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
