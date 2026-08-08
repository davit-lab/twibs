import { useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ReportDialog from '@/components/social/ReportDialog';
import ShareProfileDialog from '@/components/social/ShareProfileDialog';
import { useToast } from '@/hooks/use-toast';
import { useBlockedUsers, useMutedUsers, useSafetyActions } from '@/hooks/useSafety';
import { QrCode, UserX, VolumeX, Volume2, Flag, Check } from 'lucide-react';

interface ProfileActionsMenuProps {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  trigger: ReactNode;
  onBlocked?: () => void;
}

export default function ProfileActionsMenu({
  userId,
  username,
  displayName,
  avatarUrl,
  trigger,
  onBlocked,
}: ProfileActionsMenuProps) {
  const { toast } = useToast();
  const { data: blockedIds = [] } = useBlockedUsers();
  const { data: mutedIds = [] } = useMutedUsers();
  const { blockUser, unblockUser, muteUser, unmuteUser } = useSafetyActions();
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);

  const isBlocked = blockedIds.includes(userId);
  const isMuted = mutedIds.includes(userId);

  const handleMute = async () => {
    if (isMuted) await unmuteUser(userId);
    else await muteUser(userId);
  };

  const handleBlock = async () => {
    const ok = await blockUser(userId);
    setConfirmBlockOpen(false);
    if (ok) onBlocked?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel className="truncate">@{username}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/30" />
          <DropdownMenuItem className="gap-2 text-sm rounded-lg" onClick={() => setShareOpen(true)}>
            <QrCode className="h-4 w-4" />
            Share profile
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/30" />
          <DropdownMenuItem className="gap-2 text-sm rounded-lg" onClick={handleMute}>
            {isMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive text-sm rounded-lg"
            onClick={() => setConfirmBlockOpen(true)}
          >
            {isBlocked ? <Check className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            {isBlocked ? 'Blocked' : 'Block'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-sm rounded-lg"
            onClick={() => setReportOpen(true)}
          >
            <Flag className="h-4 w-4" />
            Report profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareProfileDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        displayName={displayName}
        username={username}
        avatarUrl={avatarUrl}
      />

      <AlertDialog open={confirmBlockOpen} onOpenChange={setConfirmBlockOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? `Unblock @${username}?` : `Block @${username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? 'They will be able to see your posts and message you again.'
                : 'They won\u2019t be able to follow you, see your posts, or message you.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlock}
              className={isBlocked ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {isBlocked ? 'Unblock' : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="profile"
        targetId={userId}
        targetLabel={`@${username}`}
      />
    </>
  );
}
