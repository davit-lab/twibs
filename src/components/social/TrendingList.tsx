import { Link } from 'react-router-dom';
import { TrendingUp, Star, MessageCircle, Repeat, BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrendingPosts } from '@/hooks/useDiscover';
import { formatDistanceToNow } from 'date-fns';

export default function TrendingList() {
  const { data: posts = [], isLoading } = useTrendingPosts(5);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          Popular now
        </h3>
      </div>

      <div className="divide-y divide-border/40">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            No trending posts yet — be the first!
          </p>
        ) : (
          posts.map((post, index) => (
            <div key={post.id} className="px-4 py-3 flex gap-3">
              <div className="w-6 flex-shrink-0">
                <span className={index < 3 ? 'text-primary font-black' : 'text-muted-foreground font-bold'}>
                  {index + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/profile/${post.profiles.username}`}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors min-w-0"
                >
                  <span className="truncate">{post.profiles.username}</span>
                  {post.profiles.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                  <span className="text-muted-foreground/50 ml-auto text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(post.created_at))}
                  </span>
                </Link>
                <Link
                  to={`/post/${post.id}`}
                  className="mt-0.5 block text-sm leading-snug line-clamp-2 hover:text-primary transition-colors"
                >
                  {post.content || <span className="italic text-muted-foreground">(media post)</span>}
                </Link>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" /> {post.star_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {post.comment_count}
                  </span>
                  {post.repost_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Repeat className="h-3 w-3" /> {post.repost_count}
                    </span>
                  )}
                </div>
              </div>
              <Link to={`/profile/${post.profiles.username}`} className="flex-shrink-0 self-start">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={post.profiles.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">{post.profiles.display_name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
