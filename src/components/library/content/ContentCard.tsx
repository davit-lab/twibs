import { Link } from 'react-router-dom';
import {
  BookOpen,
  Music,
  FileText,
  Image as ImageIcon,
  Film,
  Heart,
  Lock,
  Users,
  BadgeCheck,
  Eye,
  Play,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ContentKind, LibraryContent } from '@/lib/library-content';
import { displayInitials } from '@/lib/library-content';
import { cn } from '@/lib/utils';

export const KIND_ICON: Record<ContentKind, React.ElementType> = {
  book: BookOpen,
  audio: Music,
  pdf: FileText,
  image: ImageIcon,
  video: Film,
};

export const KIND_LABEL: Record<ContentKind, string> = {
  book: 'Book',
  audio: 'Audio',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
};

function ContentTypeBadge({ kind, className }: { kind: ContentKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-background/90 border border-border/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur',
        className
      )}
    >
      <Icon className="h-3 w-3 text-primary" />
      {KIND_LABEL[kind]}
    </span>
  );
}

function VisibilityBadge({ visibility }: { visibility?: 'public' | 'followers' | 'private' }) {
  if (!visibility || visibility === 'public') return null;
  const Icon = visibility === 'followers' ? Users : Lock;
  return (
    <span
      title={visibility === 'followers' ? 'Followers only' : 'Private'}
      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 border border-border/60 text-muted-foreground shadow-sm backdrop-blur"
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

function MetaRow({ content }: { content: LibraryContent }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
      {content.progressPercent !== undefined && content.kind === 'book' ? (
        <>
          <span className="font-semibold text-primary">{content.progressPercent}%</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${content.progressPercent}%` }}
            />
          </div>
        </>
      ) : (
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {content.viewCount}
        </span>
      )}
      {content.likeCount !== undefined && (
        <span className="flex items-center gap-1">
          <Heart className={cn('h-3 w-3', content.liked && 'fill-current text-red-500')} />
          {content.likeCount}
        </span>
      )}
      <span className="ml-auto shrink-0">
        {formatDistanceToNow(new Date(content.createdAt), { addSuffix: true })}
      </span>
    </div>
  );
}

function ContentCreator({ content }: { content: LibraryContent }) {
  if (!content.creator) return <span className="text-xs text-muted-foreground">Unknown</span>;
  return (
    <Link
      to={`/profile/${content.creator.username}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Avatar className="h-4 w-4 border border-border/60">
        <AvatarImage src={content.creator.avatarUrl || undefined} />
        <AvatarFallback className="text-[7px] font-bold">
          {displayInitials(content.creator.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{content.creator.displayName}</span>
      {content.creator.isVerified && <BadgeCheck className="h-3 w-3 shrink-0 text-primary" />}
    </Link>
  );
}

interface ContentCardProps {
  content: LibraryContent;
  variant?: 'grid' | 'list';
  onLike?: (content: LibraryContent) => void;
  onRemove?: () => void;
}

export default function ContentCard({ content, variant = 'grid', onLike, onRemove }: ContentCardProps) {
  const TypeIcon = KIND_ICON[content.kind];
  const isComplete = content.meta.isComplete;

  if (variant === 'list') {
    return (
      <div className="group flex gap-4 rounded-2xl border border-border/60 bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
        <Link
          to={content.route}
          className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted sm:w-20"
        >
          {content.thumbnail ? (
            <img
              src={content.thumbnail}
              alt={content.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <TypeIcon className="h-6 w-6 text-muted-foreground/40" />
            </div>
          )}
          <ContentTypeBadge kind={content.kind} className="absolute left-1.5 top-1.5 px-1.5" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={content.route}
                className="line-clamp-1 font-bold tracking-tight transition-colors hover:text-primary"
              >
                {content.title}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <ContentCreator content={content} />
                {content.genre && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {content.genre}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onLike && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLike(content);
                  }}
                  className={cn(
                    'flex items-center rounded-lg p-1.5 transition-colors',
                    content.liked
                      ? 'text-red-500'
                      : 'text-muted-foreground opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100'
                  )}
                >
                  <Heart className={cn('h-4 w-4', content.liked && 'fill-current')} />
                </button>
              )}
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                >
                  <Lock className="h-3.5 w-3.5 rotate-45" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-auto pt-3">
            <MetaRow content={content} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col">
      <Link
        to={content.route}
        className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10"
      >
        {content.thumbnail ? (
          <img
            src={content.thumbnail}
            alt={content.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
            <TypeIcon className="h-14 w-14 text-muted-foreground/25" />
          </div>
        )}

        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {content.kind === 'audio' && (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <Play className="ml-0.5 h-5 w-5 text-black" />
            </span>
          </span>
        )}

        <ContentTypeBadge kind={content.kind} className="absolute left-2 top-2" />
        <VisibilityBadge visibility={content.meta.visibility} />

        {isComplete && (
          <span className="absolute bottom-2 left-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Completed
          </span>
        )}
      </Link>

      <div className="mt-2.5 flex flex-col gap-1 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={content.route}
            className="line-clamp-2 text-sm font-bold leading-snug tracking-tight transition-colors hover:text-primary"
          >
            {content.title}
          </Link>
          {onLike && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLike(content);
              }}
              aria-label="Like"
              className={cn(
                'flex shrink-0 items-center rounded-lg p-1 transition-colors',
                content.liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-400'
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', content.liked && 'fill-current')} />
            </button>
          )}
        </div>
        <ContentCreator content={content} />
        <MetaRow content={content} />
      </div>
    </div>
  );
}

export function ContentCardGrid({
  items,
  onLike,
  onRemove,
}: {
  items: LibraryContent[];
  onLike?: (content: LibraryContent) => void;
  onRemove?: (content: LibraryContent) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((content) => (
        <ContentCard
          key={content.key}
          content={content}
          onLike={onLike}
          onRemove={onRemove ? () => onRemove(content) : undefined}
        />
      ))}
    </div>
  );
}