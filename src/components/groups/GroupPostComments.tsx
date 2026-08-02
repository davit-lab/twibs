import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupPostComments, useGroupActions, GroupPostComment } from '@/hooks/useGroups';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Send, Loader2, Trash2, Reply, ChevronDown, ChevronUp, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildDmUrl, snippet } from '@/lib/dm';

interface GroupPostCommentsProps {
  postId: string;
  commentCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommentItemProps {
  comment: GroupPostComment;
  replies: GroupPostComment[];
  currentUserId?: string;
  onReply: (commentId: string, username: string) => void;
  onDelete: (commentId: string) => void;
  isDeleting: boolean;
}

function CommentItem({ comment, replies, currentUserId, onReply, onDelete, isDeleting }: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(true);
  const navigate = useNavigate();
  const hasReplies = replies.length > 0;
  const username = comment.profiles?.username || '';
  const displayName = comment.profiles?.display_name || 'User';

  const handleDm = () => {
    navigate(buildDmUrl(comment.user_id, username, `your comment: ${snippet(comment.content, 48)}`));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Link to={`/profile/${username}`} className="flex-shrink-0 mt-0.5">
          <Avatar className="h-8 w-8 border border-border/50">
            <AvatarImage src={comment.profiles?.avatar_url || undefined} />
            <AvatarFallback className="text-xs font-bold">
              {displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="bg-surface rounded-r-xl rounded-bl-xl px-3 py-2 border border-border/40">
            <div className="flex items-center gap-1.5">
              <Link to={`/profile/${username}`} className="text-[13px] font-bold text-foreground hover:text-primary transition-colors">
                {displayName}
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                @{username}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words mt-0.5">{comment.content}</p>
          </div>

          <div className="flex items-center gap-3 mt-1.5 px-0.5">
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            <button
              onClick={() => onReply(comment.id, username)}
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors"
            >
              <Reply className="h-3 w-3" />
              Answer
            </button>
            <button
              onClick={handleDm}
              title="Message"
              className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors"
            >
              <Send className="h-3 w-3" />
              Message
            </button>
            {currentUserId === comment.user_id && (
              <button
                onClick={() => onDelete(comment.id)}
                disabled={isDeleting}
                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {hasReplies && (
        <div className="ml-11">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary mb-2.5"
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showReplies ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'answer' : 'answers'}
          </button>

          {showReplies && (
            <div className="space-y-3 border-l-2 border-border/40 pl-4">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-3">
                  <Link to={`/profile/${reply.profiles?.username}`} className="flex-shrink-0 mt-0.5">
                    <Avatar className="h-7 w-7 border border-border/50">
                      <AvatarImage src={reply.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-[11px] font-bold">
                        {reply.profiles?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="bg-surface rounded-r-xl rounded-bl-xl px-3 py-2 border border-border/40">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/profile/${reply.profiles?.username}`} className="text-[13px] font-bold text-foreground hover:text-primary transition-colors">
                          {reply.profiles?.display_name}
                        </Link>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          @{reply.profiles?.username}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words mt-0.5">{reply.content}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 px-0.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                      <button
                        onClick={() => onReply(comment.id, reply.profiles?.username || '')}
                        className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Reply className="h-3 w-3" />
                        Answer
                      </button>
                      {currentUserId === reply.user_id && (
                        <button
                          onClick={() => onDelete(reply.id)}
                          disabled={isDeleting}
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GroupPostComments({ postId, commentCount, open, onOpenChange }: GroupPostCommentsProps) {
  const { user } = useAuth();
  const { data: comments, isLoading } = useGroupPostComments(postId);
  const { addComment, deleteComment } = useGroupActions();

  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open, replyingTo]);

  if (!open) return null;

  const topLevelComments = comments?.filter((c) => !c.parent_id) || [];
  const repliesMap = new Map<string, GroupPostComment[]>();
  comments?.forEach((comment) => {
    if (comment.parent_id) {
      const existing = repliesMap.get(comment.parent_id) || [];
      existing.push(comment);
      repliesMap.set(comment.parent_id, existing);
    }
  });

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;
    await addComment.mutateAsync({
      postId,
      content: newComment.trim(),
      parentId: replyingTo?.id,
    });
    setNewComment('');
    setReplyingTo(null);
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setNewComment(`@${username} `);
  };

  const handleDelete = async (commentId: string) => {
    await deleteComment.mutateAsync({ commentId, postId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className="mt-4 pt-4 border-t border-border/60 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5" />
          Comments
          <span className="text-foreground/70 font-bold">{commentCount}</span>
        </h3>
        <button
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>

      {/* List */}
      <div className="space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : topLevelComments.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/60 rounded-xl bg-surface/30">
            <div className="w-10 h-10 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-bold text-sm mb-1">No comments yet</p>
            <p className="text-[13px] text-muted-foreground">
              Be the first to answer this post
            </p>
          </div>
        ) : (
          topLevelComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) || []}
              currentUserId={user?.id}
              onReply={handleReply}
              onDelete={handleDelete}
              isDeleting={deleteComment.isPending}
            />
          ))
        )}
      </div>

      {/* Composer */}
      {user ? (
        <div className="mt-4 pt-4 border-t border-border/40">
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-surface border border-border/40 rounded-lg">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em]">
                <Reply className="h-3 w-3 text-primary" />
                Answering <span className="text-primary">@{replyingTo.username}</span>
              </span>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setNewComment('');
                }}
                className="text-[11px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-[0.08em]"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Avatar className="h-8 w-8 flex-shrink-0 mb-0.5 border border-border/50">
              <AvatarImage src={undefined} />
              <AvatarFallback className="text-xs font-bold">
                {user.user_metadata?.display_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                placeholder={replyingTo ? `Answer @${replyingTo.username}...` : 'Write a comment...'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="min-h-[40px] max-h-[140px] resize-none pr-10 py-2.5 bg-surface/60 border-border/50 focus-visible:ring-primary/30"
              />
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  'absolute right-1 bottom-1 h-8 w-8 transition-colors',
                  newComment.trim() ? 'text-primary' : 'text-muted-foreground'
                )}
                disabled={!newComment.trim() || addComment.isPending}
                onClick={handleSubmit}
              >
                {addComment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-border/40 text-center">
          <p className="text-[13px] text-muted-foreground">
            <Link to="/auth" className="text-primary font-bold hover:underline">Sign in</Link> to comment
          </p>
        </div>
      )}
    </section>
  );
}
