import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Bell,
  BellOff,
  Phone,
  PhoneOff,
  LogOut,
  Shield,
  Palette,
  Clock3,
  Trash2,
  X,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/hooks/useConversations';

interface ConversationInfoPanelProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  avatarUrl: string | null;
  isGroup: boolean;
  isCommunity: boolean;
  isOnline: boolean;
  presenceStatus: string | null;
  muted: boolean;
  isBlocked: boolean;
  isConversationOwner: boolean;
  participantCount?: number;
  onToggleMute: () => void;
  onToggleBlock: () => void;
  onLeave: () => void;
  onDeleteConversation?: () => void;
  onViewProfile: () => void;
  onWallpaperOpen: () => void;
  onScheduleOpen: () => void;
  getInitials: (name: string) => string;
}

export default function ConversationInfoPanel({
  open,
  onClose,
  displayName,
  avatarUrl,
  isGroup,
  isCommunity,
  isOnline,
  presenceStatus,
  muted,
  isBlocked,
  isConversationOwner,
  participantCount,
  onToggleMute,
  onToggleBlock,
  onLeave,
  onDeleteConversation,
  onViewProfile,
  onWallpaperOpen,
  onScheduleOpen,
  getInitials,
}: ConversationInfoPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-card border-l border-border z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            role="dialog"
            aria-label="Conversation info"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
              <h2 className="font-semibold text-sm">Conversation info</h2>
              <button
                type="button"
                onClick={onClose}
                className="icon-btn h-8 w-8 rounded-full"
                aria-label="Close info panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Profile Section */}
              <div className="flex flex-col items-center py-6 px-4">
                <Avatar className="h-20 w-20 rounded-full ring-2 ring-primary/15">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="rounded-full bg-primary/15 text-primary text-2xl font-bold">
                    {isGroup ? (
                      <span className="text-lg">
                        {(participantCount || 0).toString()}
                      </span>
                    ) : (
                      getInitials(displayName)
                    )}
                  </AvatarFallback>
                </Avatar>
                {!isGroup && isOnline && (
                  <span className="mt-2 w-2.5 h-2.5 rounded-full bg-success" aria-hidden="true" />
                )}
                <h3 className="mt-3 font-semibold text-base">{displayName}</h3>
                <p className={cn('text-sm mt-0.5', isGroup ? 'text-muted-foreground' : isOnline ? 'text-success' : 'text-muted-foreground')}>
                  {isGroup ? (
                    <>{participantCount || 0} members</>
                  ) : (
                    presenceStatus || 'Last seen recently'
                  )}
                </p>
                {isCommunity && (
                  <span className="mt-2 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    Community
                  </span>
                )}
              </div>

              {/* Actions Section */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Scheduled messages</p>
                  </div>
                </div>
              </div>

              {/* Conversation Controls */}
              <div className="px-4 pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                  Controls
                </p>
                <button
                  type="button"
                  onClick={onWallpaperOpen}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm">Chat wallpaper</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center">
                    {muted ? (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-sm">{muted ? 'Unmute notifications' : 'Mute notifications'}</span>
                </button>
              </div>

              {/* Safety Section */}
              {!isGroup && (
                <div className="px-4 pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                    Safety
                  </p>
                  <button
                    type="button"
                    onClick={onToggleBlock}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left',
                      isBlocked ? 'text-success' : 'text-destructive'
                    )}
                  >
                    <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center">
                      {isBlocked ? (
                        <Phone className="h-4 w-4" />
                      ) : (
                        <PhoneOff className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-sm">{isBlocked ? 'Unblock Calls' : 'Block Calls'}</span>
                  </button>
                </div>
              )}

              {/* Leave / Delete (Groups/Communities) */}
              {isGroup && (
                <div className="px-4 pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                    {isCommunity ? 'Community' : 'Group'}
                  </p>
                  <button
                    type="button"
                    onClick={onLeave}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left text-destructive"
                  >
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <span className="text-sm">Leave {isCommunity ? 'community' : 'group'}</span>
                  </button>
                  {isConversationOwner && onDeleteConversation && (
                    <button
                      type="button"
                      onClick={onDeleteConversation}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-left text-destructive mt-1"
                    >
                      <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <Trash2 className="h-4 w-4" />
                      </div>
                      <span className="text-sm">Delete {isCommunity ? 'community' : 'group'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* View Profile (DMs) */}
              {!isGroup && (
                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={onViewProfile}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm">View Profile</span>
                  </button>
                </div>
              )}

              {/* Shared Content placeholder */}
              <div className="px-4 pb-8">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                  Shared
                </p>
                <div className="px-3 py-8 flex flex-col items-center justify-center text-center rounded-xl bg-muted/20">
                  <Shield className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Shared content</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Media, links and files</p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
