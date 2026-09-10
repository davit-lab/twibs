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
  Trash2,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  X,
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

function isEdited(comment: InterestPostComment): boolean {
  return (
    !!comment.updated_at &&
    new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime()
  );
}

function CommentItem({ comment, currentUserId, depth = 0, onReport }: CommentItemProps) {
  const { user } = useAuth();
  const { addComment, deleteComment, updateComment } = useInterestCommentActions();

  const [showReplies, setShowReplies] = useState(depth < 2);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const currentUser = user?.id ?? currentUserId;
  const isOwnComment = comment.user_id === currentUser;
  const profile = comment.profiles;
  const displayName = profile?.display_name || 'User';

  const handleSubmitReply = () => {
    const body = replyContent.trim();
    if (!body) return;
    const parentId = depth >= MAX_DEPTH - 1 ? comment.parent_id : comment.id;
    if (!parentId) return;
    addComment.mutate({
      postId: comment.post_id,
      content: body,
      parentId,
    });
    setReplyContent('');
    setIsReplying(false);
  };

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    updateComment.mutate({
      commentId: comment.id,
      postId: comment.post_id,
      content: trimmed,
    });
    setEditContent(trimmed);
    setIsEditing(false);
  };

  const nestedReplies: InterestPostComment[] = (comment as any).replies || [];

  return (
    <div className={cn('group', depth > 0 && 'mt-2')}>
      <div className="flex gap-2.5">
        <Link to={`/profile/${profile?.username || ''}`} className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || defaultAvatar} alt="" />
            <AvatarFallback className="bg-muted text-xs font-semibold">
              {displayName[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link
              to={`/profile/${profile?.username || ''}`}
              className="text-[13px] font-semibold hover:underline"
            >
              {displayName}
            </Link>
            {profile?.is_verified && (
              <BadgeCheck className="h-3.5 w-3.5 text-primary self-center" />
            )}
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {isEdited(comment) && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                edited
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1.5">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-1.5 flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim() || updateComment.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditContent(comment.content);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-foreground/90 break-words whitespace-pre-wrap">
              <RichText text={comment.content} />
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-3">
            {depth < MAX_DEPTH && currentUser && (
              <button
                onClick={() => setIsReplying(!isReplying)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {isReplying ? 'Cancel' : 'Reply'}
              </button>
            )}
            {isOwnComment && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  More
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40 bg-background border-border/60 p-1">
                {isOwnComment ? (
                  <DropdownMenuItem
                    className="gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={() =>
                      deleteComment.mutate({
                        commentId: comment.id,
                        postId: comment.post_id,
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="gap-2 text-xs"
                    onClick={() => onReport(comment.id)}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isReplying && (
            <div className="mt-2 flex items-center gap-2">
              <input
                autoFocus
                placeholder={`Reply to ${displayName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitReply();
                  }
                }}
                className="h-9 flex-1 rounded-xl border border-border/60 bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-primary hover:bg-primary/10"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim() || addComment.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground hover:bg-surface-2"
                onClick={() => {
                  setIsReplying(false);
                  setReplyContent('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {nestedReplies.length > 0 && (
            <div className="mt-2">
              {showReplies && (
                <div className="space-y-0 border-l-2 border-border/70 pl-3 sm:pl-4">
                  {nestedReplies.map((reply) => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      currentUserId={currentUser}
                      depth={depth + 1}
                      onReport={onReport}
                    />
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {showReplies ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {showReplies
                  ? `Hide ${nestedReplies.length} ${nestedReplies.length === 1 ? 'reply' : 'replies'}`
                  : `View ${nestedReplies.length} ${nestedReplies.length === 1 ? 'reply' : 'replies'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InterestPostComments({ postId }: InterestPostCommentsProps) {
  const { user, profile } = useAuth();
  const {
    data: comments = [],
    isLoading,
    isError,
    refetch,
  } = useInterestPostComments(postId);
  const { addComment } = useInterestCommentActions();

  const [body, setBody] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);

  const handlePost = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    addComment.mutate(
      { postId, content: trimmed },
      { onSuccess: () => setBody('') }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 py-1">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
        <div className="ml-9 space-y-4 border-l-2 border-border/60 pl-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-semibold">Couldn't load the discussion</p>
        <button
          onClick={() => refetch()}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-bold tracking-tight">Discussion</p>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
          </span>
        )}
      </div>

      {user ? (
        <div className="flex items-center gap-2">
          <Link to={`/profile/${profile?.username || ''}`} className="flex-shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || defaultAvatar} alt="" />
              <AvatarFallback className="bg-muted text-xs font-semibold">
                {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <input
            placeholder="Join the discussion..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePost();
              }
            }}
            className="h-10 flex-1 rounded-xl border border-border/60 bg-surface px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full text-primary hover:bg-primary/10"
            onClick={handlePost}
            disabled={!body.trim() || addComment.isPending}
          >
            <Send className="h-[18px] w-[18px]" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{' '}
          to join the discussion.
        </p>
      )}

      {comments.length === 0 ? (
        <div className="pt-4 pb-2 text-center">
          <p className="text-sm font-semibold">Start the discussion</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Be the first to share your take on this post.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              depth={0}
              onReport={setReportId}
            />
          ))}
        </div>
      )}

      {reportId && (
        <ReportDialog
          open={!!reportId}
          onOpenChange={(open) => {
            if (!open) setReportId(null);
          }}
          targetType="interest_post_comment"
          targetId={reportId || ''}
          targetLabel="comment"
        />
      )}
    </div>
  );
}