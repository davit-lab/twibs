import { Link } from 'react-router-dom';
import { LibraryItem } from '@/hooks/useLibraryItems';
import { Heart, MessageCircle, Download, Eye, FileAudio, FileText, Image, Play, Lock, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface LibraryItemCardProps {
  item: LibraryItem;
  onLike?: (id: string) => void;
  showAuthor?: boolean;
}

export default function LibraryItemCard({ item, onLike, showAuthor = true }: LibraryItemCardProps) {
  const getTypeIcon = () => {
    switch (item.type) {
      case 'audio':
        return <FileAudio className="h-8 w-8" />;
      case 'pdf':
        return <FileText className="h-8 w-8" />;
      case 'image':
        return <Image className="h-8 w-8" />;
      default:
        return <FileText className="h-8 w-8" />;
    }
  };

  const getTypeColor = () => {
    switch (item.type) {
      case 'audio':
        return 'from-violet-500/20 to-purple-500/20 text-violet-500';
      case 'pdf':
        return 'from-red-500/20 to-orange-500/20 text-red-500';
      case 'image':
        return 'from-green-500/20 to-emerald-500/20 text-green-500';
      default:
        return 'from-gray-500/20 to-slate-500/20 text-gray-500';
    }
  };

  const getVisibilityIcon = () => {
    switch (item.visibility) {
      case 'private':
        return <Lock className="h-3 w-3" />;
      case 'followers':
        return <Users className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <Link
      to={`/library/item/${item.id}`}
      className="group block bg-card rounded-xl border border-border/50 overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all duration-200"
    >
      {/* Thumbnail / Preview */}
      <div className={cn(
        "relative aspect-square flex items-center justify-center bg-gradient-to-br",
        getTypeColor()
      )}>
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          getTypeIcon()
        )}

        {/* Type badge */}
        <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50  text-white text-xs rounded-full uppercase">
          {item.type}
        </span>

        {/* Visibility indicator */}
        {item.visibility !== 'public' && (
          <span className="absolute top-2 right-2 p-1.5 bg-black/50  text-white rounded-full">
            {getVisibilityIcon()}
          </span>
        )}

        {/* Play overlay for audio */}
        {item.type === 'audio' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="h-6 w-6 text-black ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <h3 className="font-medium line-clamp-1 group-hover:text-primary transition-colors">
          {item.title}
        </h3>

        {showAuthor && item.profiles && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            by {item.profiles.display_name}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {item.view_count}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLike?.(item.id);
            }}
            className={cn(
              "flex items-center gap-1 hover:text-red-500 transition-colors",
              item.is_liked && "text-red-500"
            )}
          >
            <Heart className={cn("h-3 w-3", item.is_liked && "fill-current")} />
            {item.like_count}
          </button>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {item.comment_count}
          </span>
          {item.allow_downloads && (
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {item.download_count}
            </span>
          )}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded"
              >
                #{tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{item.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}
