import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments } from '@/hooks/useComments';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';
import CommentItem from './CommentItem';
import defaultAvatar from '@/assets/default-avatar.png';

interface CommentSectionProps {
  postId: string;
  onCommented?: () => void;
}

export default function CommentSection({ postId, onCommented }: CommentSectionProps) {
  const { user, profile } = useAuth();
  const { comments, isLoading, addComment, deleteComment, editComment, vote } = useComments(postId);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    
    setIsSubmitting(true);
    const result = await addComment(newComment.trim());
    if (result) {
      setNewComment('');
      onCommented?.();
    }
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReply = async (content: string, parentId: string) => {
    return addComment(content, parentId);
  };

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
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No comments yet
        </p>
      ) : (
        <div className="space-y-1">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onVote={vote}
              onReply={handleReply}
              onDelete={deleteComment}
              onEdit={editComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
