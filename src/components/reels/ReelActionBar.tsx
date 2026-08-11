import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Bookmark, BookmarkCheck, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  activeClass?: string;
  count?: string;
  onClick: () => void;
  onCountClick?: () => void;
}

function ActionButton({ icon: Icon, label, active, activeClass, count, onClick, onCountClick }: ActionButtonProps) {
  return (
    <motion.div whileTap={{ scale: 0.82 }} className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 backdrop-blur-md transition-colors hover:bg-black/55',
        )}
      >
        <Icon className={cn('h-[22px] w-[22px]', active && activeClass, !active && 'text-white')} />
      </button>
      {count !== undefined && (
        <button
          onClick={onCountClick}
          className={cn('text-[11px] font-semibold tabular-nums drop-shadow-sm', active && activeClass, !active && 'text-white/90')}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={{ scale: 1.4, opacity: 0.3 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
              className="block"
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </button>
      )}
    </motion.div>
  );
}

interface ReelActionBarProps {
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isSaved: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onLikers: () => void;
}

export default function ReelActionBar({
  isLiked,
  likeCount,
  commentCount,
  shareCount,
  isSaved,
  onLike,
  onComment,
  onShare,
  onSave,
  onLikers,
}: ReelActionBarProps) {
  return (
    <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-3">
      <ActionButton
        icon={Heart}
        label="Like"
        count={formatCount(likeCount)}
        active={isLiked}
        activeClass="text-rose-500 fill-rose-500"
        onClick={onLike}
        onCountClick={onLikers}
      />
      <ActionButton icon={MessageCircle} label="Comment" count={formatCount(commentCount)} onClick={onComment} />
      <ActionButton
        icon={Share2}
        label="Share"
        count={formatCount(shareCount)}
        onClick={onShare}
      />
      <ActionButton
        icon={isSaved ? BookmarkCheck : Bookmark}
        label="Save"
        active={isSaved}
        activeClass="text-white fill-white"
        onClick={onSave}
      />
    </div>
  );
}
