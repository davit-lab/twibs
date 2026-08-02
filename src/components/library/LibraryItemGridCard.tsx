import { Heart, Eye, Music, FileText, Image as ImageIcon, Play, Download } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import type { LibraryItem } from '@/hooks/useLibraryItems';
import { cn } from '@/lib/utils';

interface LibraryItemGridCardProps {
  item: LibraryItem;
  onLike: (id: string) => void;
  showAuthor?: boolean;
}

const typeConfig = {
  audio: { icon: Music, color: 'bg-emerald-500', label: 'Audio' },
  pdf: { icon: FileText, color: 'bg-rose-500', label: 'PDF' },
  image: { icon: ImageIcon, color: 'bg-sky-500', label: 'Image' },
  video: { icon: Play, color: 'bg-amber-500', label: 'Video' },
};

export default function LibraryItemGridCard({ item, onLike, showAuthor = true }: LibraryItemGridCardProps) {
  const navigate = useNavigate();
  const config = typeConfig[item.type] || typeConfig.image;
  const TypeIcon = config.icon;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const formatCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div 
      className="group flex flex-col gap-4 cursor-pointer relative"
      onClick={() => navigate(`/library/item/${item.id}`)}
    >
      {/* Hover Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 pointer-events-none" />
      
      {/* Thumbnail Container */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted  transition-all duration-500 group-hover:-translate-y-2 group-hover: group-hover:shadow-primary/10">
        {item.thumbnail_url || item.type === 'image' ? (
          <img
            src={item.thumbnail_url || item.file_url}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
            <TypeIcon className="h-16 w-16 text-muted-foreground/30" />
          </div>
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {/* Type Badge */}
        <div className={cn(
          "absolute top-3 left-3 px-3 py-1.5 rounded-lg text-white text-[10px] font-black uppercase tracking-widest  flex items-center gap-1.5",
          config.color
        )}>
          <TypeIcon className="h-3 w-3" />
          {config.label}
        </div>

        {/* Quick Actions */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
          <div className="flex items-center gap-2">
          <button 
              onClick={(e) => { e.stopPropagation(); onLike(item.id); }}
              className={cn(
                "w-10 h-10 rounded-xl  flex items-center justify-center transition-all hover:scale-110 active:scale-90 border border-white/20",
                item.is_liked 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-white/10 text-white hover:bg-destructive"
              )}
            >
              <Heart className={cn("h-4 w-4", item.is_liked && "fill-current")} />
            </button>
          </div>
          
          {item.allow_downloads && (
            <button 
              onClick={(e) => { e.stopPropagation(); window.open(item.file_url, '_blank'); }}
              className="w-10 h-10 rounded-xl bg-white/10  text-white flex items-center justify-center transition-all hover:scale-110 hover:bg-white/20 border border-white/20"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 px-1 relative z-10">
        <h4 className="text-lg font-black text-foreground tracking-tight leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        
        {showAuthor && item.profiles && (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={item.profiles.avatar_url || undefined} />
              <AvatarFallback className="text-[9px] bg-primary text-primary-foreground font-bold">
                {getInitials(item.profiles.display_name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
              @{item.profiles.username}
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Heart className={cn("h-3.5 w-3.5", item.is_liked && "fill-destructive text-destructive")} />
            <span className="text-xs font-black">{formatCount(item.like_count)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs font-black">{formatCount(item.view_count)}</span>
          </div>
          {item.tags?.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[9px] font-bold">
              {item.tags[0]}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
