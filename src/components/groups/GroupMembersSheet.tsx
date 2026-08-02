import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, MoreHorizontal, Shield, ShieldCheck, UserX, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupMembers, useGroupActions, GroupRole, GroupMember } from '@/hooks/useGroups';
import { buildDmUrl } from '@/lib/dm';
import { cn } from '@/lib/utils';

const ROLE_ORDER: Record<GroupRole, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };

const ROLE_LABEL: Record<GroupRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  moderator: 'Moderator',
  member: 'Member',
};

interface GroupMembersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  canManage: boolean;
  viewerRole?: GroupRole | null;
}

function RoleBadge({ role }: { role: GroupRole }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1',
        role === 'owner' && 'bg-primary/10 text-primary border-primary/20',
        role === 'admin' && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        role === 'moderator' && 'bg-sky-500/10 text-sky-600 border-sky-500/20',
        role === 'member' && 'bg-muted text-muted-foreground border-transparent'
      )}
    >
      {role === 'owner' || role === 'admin' ? (
        <ShieldCheck className="h-3 w-3" />
      ) : role === 'moderator' ? (
        <Shield className="h-3 w-3" />
      ) : null}
      {ROLE_LABEL[role]}
    </Badge>
  );
}

export default function GroupMembersSheet({ open, onOpenChange, groupId, groupName, canManage, viewerRole }: GroupMembersSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: members, isLoading } = useGroupMembers(groupId);
  const { setMemberRole, removeMember } = useGroupActions();

  const sorted = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => {
      const diff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (diff !== 0) return diff;
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });
  }, [members]);

  const isOwner = viewerRole === 'owner';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left pr-8">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Members
            <span className="text-sm font-bold text-muted-foreground">{sorted.length}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-1">
          {isLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No members yet.</p>
          ) : (
            sorted.map((member) => {
              const isViewer = member.user_id === user?.id;
              const isGroupOwner = member.role === 'owner';
              const canModify = canManage && !isViewer && !isGroupOwner;

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface/70 transition-colors"
                >
                  <Link to={`/profile/${member.profiles?.username}`} className="flex-shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={member.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-surface-2 text-foreground font-bold text-sm">
                        {member.profiles?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/profile/${member.profiles?.username}`}
                      className="font-semibold hover:underline truncate block"
                    >
                      {member.profiles?.display_name}
                      {isViewer && <span className="text-muted-foreground font-medium"> · you</span>}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground font-medium">
                        @{member.profiles?.username}
                      </p>
                      <RoleBadge role={member.role} />
                    </div>
                  </div>

                  {!isViewer && (
                    <button
                      onClick={() =>
                        navigate(
                          buildDmUrl(
                            member.user_id,
                            member.profiles?.username || '',
                            `your work in ${groupName}`
                          )
                        )
                      }
                      title={`Message @${member.profiles?.username}`}
                      className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/30 transition-colors"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  )}

                  {canModify && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {isOwner && (
                          <DropdownMenuItem
                            disabled={member.role === 'admin' || setMemberRole.isPending}
                            onClick={() => setMemberRole.mutate({ groupId, targetUserId: member.user_id, role: 'admin' })}
                          >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Make admin
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          disabled={member.role === 'moderator' || setMemberRole.isPending}
                          onClick={() => setMemberRole.mutate({ groupId, targetUserId: member.user_id, role: 'moderator' })}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Make moderator
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={member.role === 'member' || setMemberRole.isPending}
                          onClick={() => setMemberRole.mutate({ groupId, targetUserId: member.user_id, role: 'member' })}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Make member
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate({ groupId, targetUserId: member.user_id })}
                        >
                          <UserX className="h-4 w-4 mr-2" />
                          Remove from group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
