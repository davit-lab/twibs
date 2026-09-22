import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ArrowLeft,
  X,
  Phone,
  Video,
  MoreVertical,
  Users,
  Bell,
  BellOff,
  User,
  LogOut,
  Shield,
  Clock3,
  PhoneOff,
  Trash2,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/hooks/useConversations';

interface ChatHeaderProps {
  displayName: string;
  avatarUrl: string | null;
  isGroup: boolean;
  isCommunity: boolean;
  isOnline: boolean;
  presenceStatus: string | null;
  participantCount?: number;
  conversation?: Conversation;
  onBack?: () => void;
  searchOpen: boolean;
  onSearchToggle: (open: boolean) => void;
  isInCall: boolean;
  activeCallType: 'audio' | 'video' | null;
  canCall: boolean;
  callBlockReason: string | null;
  onStartCall: (type: 'audio' | 'video') => void;
  muted: boolean;
  isBlocked: boolean;
  isConversationOwner: boolean;
  onToggleMute: () => void;
  onToggleBlock: () => void;
  onLeave: () => void;
  onDeleteConversation?: () => void;
  onViewProfile: () => void;
  onScheduleOpen: () => void;
  onWallpaperOpen: () => void;
  hasWallpaper: boolean;
  infoPanelOpen: boolean;
  onInfoPanelToggle: () => void;
  getInitials: (name: string) => string;
}

function CallPopover({
  isInCall,
  activeCallType,
  canCall,
  callBlockReason,
  onStartCall,
}: {
  isInCall: boolean;
  activeCallType: 'audio' | 'video' | null;
  canCall: boolean;
  callBlockReason: string | null;
  onStartCall: (type: 'audio' | 'video') => void;
}) {
  const [open, setOpen] = useState(false);

  if (!canCall && !isInCall) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 opacity-50">
            <button className="icon-btn" disabled aria-label="Call unavailable">
              <Phone className="h-4 w-4" />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{callBlockReason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn('icon-btn', isInCall && 'text-success')}
          aria-label={isInCall ? 'Active call options' : 'Start call'}
        >
          {isInCall && activeCallType === 'video' ? (
            <Video className="h-4 w-4" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onStartCall('audio');
              setOpen(false);
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
          >
            <Phone className="h-4 w-4" />
            <span>Voice</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onStartCall('video');
              setOpen(false);
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/60 transition-colors"
          >
            <Video className="h-4 w-4" />
            <span>Video</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ChatHeader({
  displayName,
  avatarUrl,
  isGroup,
  isCommunity,
  isOnline,
  presenceStatus,
  participantCount,
  conversation,
  onBack,
  searchOpen,
  onSearchToggle,
  isInCall,
  activeCallType,
  canCall,
  callBlockReason,
  onStartCall,
  muted,
  isBlocked,
  isConversationOwner,
  onToggleMute,
  onToggleBlock,
  onLeave,
  onDeleteConversation,
  onViewProfile,
  onScheduleOpen,
  onWallpaperOpen,
  hasWallpaper,
  infoPanelOpen,
  onInfoPanelToggle,
  getInitials,
}: ChatHeaderProps) {
  const handleSearchToggle = () => {
    if (!searchOpen) {
      onSearchToggle(true);
    } else {
      onSearchToggle(false);
    }
  };

  return (
    <div
      className={cn(
        'h-[52px] px-3 md:px-5 flex items-center gap-2 border-b border-border/50 bg-card flex-shrink-0 z-10 relative'
      )}
      role="banner"
    >
      {/* LEFT ZONE — Navigation + Identity */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="md:hidden h-8 w-8 rounded-full"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <AnimatePresence mode="sync">
          {searchOpen ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 flex-1 min-w-0 ml-1"
            >
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground truncate flex-1">Search in this chat…</span>
              <button
                type="button"
                onClick={handleSearchToggle}
                className="icon-btn h-7 w-7 rounded-full flex-shrink-0"
                aria-label="Close search"
                title="Close search (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="identity"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
              onClick={onInfoPanelToggle}
              role="button"
              tabIndex={0}
              aria-label="Conversation info"
              aria-expanded={infoPanelOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onInfoPanelToggle();
                }
              }}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <Avatar className="h-9 w-9 rounded-full ring-1 ring-primary/15">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="rounded-full bg-primary/15 text-primary text-xs font-bold">
                    {isGroup ? (
                      <Users className="h-4 w-4" />
                    ) : (
                      getInitials(displayName)
                    )}
                  </AvatarFallback>
                </Avatar>
                {!isGroup && (
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 w-2 h-2 rounded-full border-[1.5px]',
                      'border-card',
                      isOnline ? 'bg-success' : 'bg-muted-foreground/30'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Name + Status */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[13px] leading-tight truncate flex items-center gap-1">
                  <span className="truncate">{displayName}</span>
                  {isCommunity && (
                    <span className="text-[9px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Community
                    </span>
                  )}
                </h3>
                <span
                  className={cn(
                    'text-[11px] leading-tight truncate block',
                    isGroup ? 'text-muted-foreground' : isOnline ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {isGroup ? (
                    <>{participantCount || 0} members</>
                  ) : (
                    presenceStatus || 'Last seen recently'
                  )}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT ZONE — Primary Actions */}
      {!searchOpen && (
        <motion.div
          className="flex items-center gap-1 flex-shrink-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Search */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="icon-btn"
                onClick={handleSearchToggle}
                aria-label="Search in chat"
              >
                <Search className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Search in chat</TooltipContent>
          </Tooltip>

          {/* Call */}
          <CallPopover
            isInCall={isInCall}
            activeCallType={activeCallType}
            canCall={canCall}
            callBlockReason={callBlockReason}
            onStartCall={onStartCall}
          />

          {/* Wallpaper (if applicable) */}
          {hasWallpaper && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="icon-btn"
                  onClick={onWallpaperOpen}
                  aria-label="Chat wallpaper"
                  title="Chat wallpaper"
                >
                  <span className="block h-3.5 w-3.5 rounded-sm bg-gradient-to-br from-primary/40 to-primary/80 border border-primary/30" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Chat wallpaper</TooltipContent>
            </Tooltip>
          )}

          {/* More */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="icon-btn" aria-label="More options" aria-haspopup="menu">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {isGroup ? (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Users className="h-4 w-4 mr-2" />
                      Members ({conversation?.participant_count || 0})
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      <div className="p-1">
                        {(conversation?.participants || []).map((participant) => (
                          <div
                            key={participant.user_id}
                            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50"
                          >
                            <Avatar className="h-8 w-8 rounded-full">
                              <AvatarImage src={participant.profiles?.avatar_url || undefined} />
                              <AvatarFallback className="rounded-full bg-primary/15 text-primary text-xs font-bold">
                                {getInitials(participant.profiles?.display_name || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {participant.profiles?.display_name || 'User'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {participant.role === 'owner'
                                  ? 'Owner'
                                  : participant.role === 'admin'
                                  ? 'Admin'
                                  : 'Member'}
                              </p>
                            </div>
                            {participant.role === 'owner' && (
                              <span className="text-primary">●</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={onScheduleOpen}>
                    <Clock3 className="h-4 w-4 mr-2" /> Scheduled messages
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onToggleMute}>
                    {muted ? (
                      <>
                        <BellOff className="h-4 w-4 mr-2" /> Unmute notifications
                      </>
                    ) : (
                      <>
                        <Bell className="h-4 w-4 mr-2" /> Mute notifications
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isConversationOwner && (
                    <>
                      <DropdownMenuItem
                        onClick={onDeleteConversation}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete {isCommunity ? 'community' : 'group'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={onLeave} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Leave {isCommunity ? 'community' : 'group'}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={onViewProfile}>
                    <User className="h-4 w-4 mr-2" /> View Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onScheduleOpen}>
                    <Clock3 className="h-4 w-4 mr-2" /> Scheduled messages
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onToggleBlock} className={isBlocked ? 'text-success' : 'text-destructive focus:text-destructive'}>
                    {isBlocked ? (
                      <>
                        <Phone className="h-4 w-4 mr-2" /> Unblock Calls
                      </>
                    ) : (
                      <>
                        <PhoneOff className="h-4 w-4 mr-2" /> Block Calls
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      )}
    </div>
  );
}
