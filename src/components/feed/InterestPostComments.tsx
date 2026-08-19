import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useInterestPostComments,
  useInterestCommentActions,
  InterestPostComment,
} from '@/hooks/useInterestPosts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Send,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Check,
  X,
  Pencil,
  Flag,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import defaultAvatar from '@/assets/default-avatar.png';
import RichText from '@/components/rich/RichText';
import ReportDialog from '@/components/social/ReportDialog';

interface InterestPostCommentsProps {
  postId: string;
}

interface CommentItemProps {
  comment: InterestPostComment;
  currentUserId?: string;
  depth?: number;
  onReport: (commentId: string) => void;
}

const MAX_DEPTH = 3;

function isEdited(comment: InterestPostComment) {
  return (
    !!comment.updated_at &&
    new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime()
  );
}

function CommentItem({ comment, currentUserId, depth = 0, onReport }: CommentItemProps) {
  const { user } = useAuth();
  const { addComment, deleteComment, updateComment } = useInterestCommentActions();

  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isOwnComment = currentUserId === comment.user_id;
  const profile = comment.profiles;
  const displayName = profile?.display_name || 'User';

  const handleSubmitReply = async () => {
    if (!replyContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment.mutateAsync({
        postId: comment.post_id,
        content: replyContent.trim(),
        parentId: comment.id,
      });
      setReplyContent('');
      setIsReplying(false);
    } catch {
      // error toast handled in mutation
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
  };

  const startEditing = () => {
    setEditContent(comment.content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await updateComment.mutateAsync({
        commentId: comment.id,
        postId: comment.post_id,
        content: editContent.trim(),
      });
      setIsEditing(false);
    } catch {
      // error toast handled in mutation
    }
    setIsSavingEdit(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const nestedReplies = (comment as any).replies || [];

  return (
    <div className={cn('group', depth > 0 && 'ml-10 mt-2')}>
      <div className="flex gap-2">
        <Link to={`/profile/${profile?.username || ''}`} className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || defaultAvatar} />
            <AvatarFallback className="bg-muted text-xs">
              {displayName[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="bg-muted/40 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/profile/${profile?.username || ''}`}
                className="font-semibold text-sm hover:underline"
              >
                {displayName}
              </Link>
              {profile?.is_verified && (
                <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            {isEditing ? (
              <div className="mt-1.5 flex flex-col gap-1.5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  rows={2}
                  autoFocus
                  className="w-full bg-background/60 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim() || isSavingEdit}
                    className="h-7 w-7 rounded-full text-primary hover:bg-primary/10 disabled:opacity-30"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditing(false)}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground/90 mt-0.5 break-words">
                <RichText text={comment.content} />
              </p>
            )}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-1 ml-2">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: false })}
            </span>
            {isEdited(comment) && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                edited
              </span>
            )}

            {/* Reply button */}
            {depth < MAX_DEPTH && user && (
              <button
                onClick={() => setIsReplying(!isReplying)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Reply
              </button>
            )}

            {/* More menu */}
            {isOwnComment ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32 bg-card border-border">
                  <DropdownMenuItem className="gap-2 text-xs" onClick={startEditing}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-destructive focus:text-destructive text-xs"
                    onClick={() => deleteComment.mutate({ commentId: comment.id, postId: comment.post_id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32 bg-card border-border">
                  <DropdownMenuItem className="gap-2 text-xs" onClick={() => onReport(comment.id)}>
                    <Flag className="h-3.5 w-3.5" />
                    Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="flex gap-2 items-center mt-2 ml-2">
              <input
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Reply to ${displayName}...`}
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
                onClick={() => {
                  setIsReplying(false);
                  setReplyContent('');
                }}
                className="h-7 w-7 rounded-full text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Show/hide replies toggle */}
          {nestedReplies.length > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 ml-2"
            >
              {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showReplies ? 'Hide' : 'View'} {nestedReplies.length}{' '}
              {nestedReplies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {nestedReplies.length > 0 && showReplies && (
        <div className="mt-1">
          {nestedReplies.map((reply: InterestPostComment) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              depth={depth + 1}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InterestPostComments({ postId }: InterestPostCommentsProps) {
  const { user, profile } = useAuth();
  const { data: comments, isLoading } = useInterestPostComments(postId);
  const { addComment } = useInterestCommentActions();

  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment.mutateAsync({
        postId,
        content: newComment.trim(),
      });
      setNewComment('');
    } catch {
      // error toast handled in mutation
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Build reply threads from the flat list (parent_id based).
  const byParent = new Map<string, InterestPostComment[]>();
  (comments || []).forEach((comment) => {
    const key = comment.parent_id || '';
    const list = byParent.get(key) || [];
    list.push(comment);
    byParent.set(key, list);
  });
  const topLevel = byParent.get('') || [];
  const threadify = (comments: InterestPostComment[]): (InterestPostComment & { replies: InterestPostComment[] })[] =>
    comments.map((comment) => ({
      ...comment,
      replies: threadify(byParent.get(comment.id) || []),
    }));
  const threads = threadify(topLevel);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Comment input */}
      {user ? (
        <div className="flex gap-2 items-start">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url || defaultAvatar} />
            <AvatarFallback className="bg-muted text-xs">
              {profile?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className="flex-1 bg-muted/50 border border-border/50 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
              className="h-9 w-9 rounded-full text-primary hover:bg-primary/10 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          Sign in to comment
        </p>
      )}

      {/* Comments list */}
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No comments yet
        </p>
      ) : (
        <div className="space-y-1">
          {threads.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              onReport={setReportId}
            />
          ))}
        </div>
      )}

      <ReportDialog
        open={!!reportId}
        onOpenChange={(next) => !next && setReportId(null)}
        targetType="interest_post_comment"
        targetId={reportId || ''}
        targetLabel="comment"
      />
    </div>
  );
}
