import { Link } from 'react-router-dom';
import { TrendingUp, Star, MessageCircle, Repeat, BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrendingPosts } from '@/hooks/useDiscover';
import { formatDistanceToNow } from 'date-fns';

export default function TrendingList() {
  const { data: posts = [], isLoading } = useTrendingPosts(5);

  return (
    <div className="overflow-hidden border-y border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-1 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" />
          Popular now
        </h3>
      </div>

      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 px-1 py-4">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : posts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No trending posts yet — be the first!
          </p>
        ) : (
          posts.map((post, index) => (
            <article key={post.id} className="flex gap-4 px-1 py-4 transition-colors hover:bg-muted/20 sm:px-3">
              <div className="w-7 flex-shrink-0 pt-0.5">
                <span className={index < 3 ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'}>
                  {index + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/profile/${post.profiles.username}`}
                  className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="truncate">{post.profiles.username}</span>
                  {post.profiles.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                  <span className="text-muted-foreground/50 ml-auto text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(post.created_at))}
                  </span>
                </Link>
                <Link
                  to={`/post/${post.id}`}
                  className="mt-1 block line-clamp-2 text-[15px] leading-6 transition-colors hover:text-primary"
                >
                  {post.content || <span className="italic text-muted-foreground">(media post)</span>}
                </Link>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
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
            </article>
          ))
        )}
      </div>
    </div>
  );
}
