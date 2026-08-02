import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestPostComments, useInterestCommentActions, InterestPostComment } from '@/hooks/useInterestPosts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageCircle, Send, Loader2, Trash2, Reply, ChevronDown, ChevronUp 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InterestPostCommentsProps {
  postId: string;
  postAuthorName: string;
  commentCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommentItemProps {
  comment: InterestPostComment;
  replies: InterestPostComment[];
  postId: string;
  currentUserId?: string;
  onReply: (commentId: string, username: string) => void;
  onDelete: (commentId: string) => void;
  isDeleting: boolean;
}

function CommentItem({ 
  comment, 
  replies, 
  postId, 
  currentUserId, 
  onReply, 
  onDelete,
  isDeleting 
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(true);
  const hasReplies = replies.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Link to={`/profile/${comment.profiles?.username}`}>
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={comment.profiles?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {comment.profiles?.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="flex-1 min-w-0">
          <div className="bg-secondary/50 rounded-2xl px-3 py-2">
            <Link 
              to={`/profile/${comment.profiles?.username}`}
              className="font-semibold text-sm hover:underline"
            >
              {comment.profiles?.display_name}
            </Link>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          </div>
          
          <div className="flex items-center gap-3 mt-1 px-1">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            <button 
              onClick={() => onReply(comment.id, comment.profiles?.username || '')}
              className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              Reply
            </button>
            {currentUserId === comment.user_id && (
              <button 
                onClick={() => onDelete(comment.id)}
                disabled={isDeleting}
                className="text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {hasReplies && (
        <div className="ml-11">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-xs text-primary font-medium mb-2"
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showReplies ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>
          
          {showReplies && (
            <div className="space-y-3 border-l-2 border-border/50 pl-3">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-3">
                  <Link to={`/profile/${reply.profiles?.username}`}>
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarImage src={reply.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {reply.profiles?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  
                  <div className="flex-1 min-w-0">
                    <div className="bg-secondary/30 rounded-2xl px-3 py-2">
                      <Link 
                        to={`/profile/${reply.profiles?.username}`}
                        className="font-semibold text-sm hover:underline"
                      >
                        {reply.profiles?.display_name}
                      </Link>
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                        {reply.content}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1 px-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                      </span>
                      <button 
                        onClick={() => onReply(comment.id, reply.profiles?.username || '')}
                        className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                      >
                        Reply
                      </button>
                      {currentUserId === reply.user_id && (
                        <button 
                          onClick={() => onDelete(reply.id)}
                          disabled={isDeleting}
                          className="text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
                        >
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

export default function InterestPostComments({
  postId,
  postAuthorName,
  commentCount,
  open,
  onOpenChange,
}: InterestPostCommentsProps) {
  const { user } = useAuth();
  const { data: comments, isLoading } = useInterestPostComments(postId);
  const { addComment, deleteComment } = useInterestCommentActions();
  
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);

  // Organize comments into threads
  const topLevelComments = comments?.filter(c => !c.parent_id) || [];
  const repliesMap = new Map<string, InterestPostComment[]>();
  
  comments?.forEach(comment => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5" />
            Comments
            {commentCount > 0 && (
              <span className="text-muted-foreground font-normal">({commentCount})</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : topLevelComments.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium mb-1">No comments yet</p>
              <p className="text-sm text-muted-foreground">
                Be the first to comment on this post
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {topLevelComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  replies={repliesMap.get(comment.id) || []}
                  postId={postId}
                  currentUserId={user?.id}
                  onReply={handleReply}
                  onDelete={handleDelete}
                  isDeleting={deleteComment.isPending}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Comment Input */}
        {user ? (
          <div className="border-t border-border p-3">
            {replyingTo && (
              <div className="flex items-center justify-between mb-2 px-2 py-1 bg-secondary/50 rounded-lg">
                <span className="text-xs text-muted-foreground">
                  <Reply className="h-3 w-3 inline mr-1" />
                  Replying to <span className="font-medium text-foreground">@{replyingTo.username}</span>
                </span>
                <button 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Avatar className="h-8 w-8 flex-shrink-0 mb-1">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-xs">U</AvatarFallback>
              </Avatar>
              <div className="flex-1 relative">
                <Textarea
                  placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="min-h-[40px] max-h-[120px] resize-none pr-10 py-2"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "absolute right-1 bottom-1 h-8 w-8 transition-colors",
                    newComment.trim() ? "text-primary" : "text-muted-foreground"
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
          <div className="border-t border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to comment
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}