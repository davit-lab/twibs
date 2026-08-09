import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import {
  Loader2, Mail, KeyRound, LogOut, Ban, ShieldOff, Ghost, Trash2,
  FileText, MessageSquare, Clapperboard, BookOpen, Star, Users,
  Flag, BadgeCheck, MonitorSmartphone, Globe, Smartphone,
} from 'lucide-react';
import { AdminUser, UserBan, getRoleLabel } from './types';

interface UserDetailDrawerProps {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBanned: boolean;
  ban?: UserBan | null;
  isShadowBanned: boolean;
  canManageRoles: boolean;
  isAdminLevel: boolean;
  onChanged: () => void;
  onRequestBan: () => void;
  onRequestUnban: () => void;
}

interface Session {
  id: string;
  device_name: string | null;
  device_type: string | null;
  location: string | null;
  ip_address: string | null;
  is_current: boolean;
  last_active_at: string | null;
  created_at: string;
}

export default function UserDetailDrawer({
  user, open, onOpenChange, isBanned, ban, isShadowBanned,
  canManageRoles, isAdminLevel, onChanged, onRequestBan, onRequestUnban,
}: UserDetailDrawerProps) {
  const { getActivity, getSessions, forcePasswordReset, logoutAllSessions, shadowBan, deleteUser } = useAdminActions();
  const [activity, setActivity] = useState<Record<string, number> | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shadowReason, setShadowReason] = useState('');
  const [shadowDialogOpen, setShadowDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActivity(null);
    setSessions(null);
    setLoading(true);
    Promise.all([getActivity(user.user_id), getSessions(user.user_id)]).then(([a, s]) => {
      setActivity(a);
      setSessions(s);
      setLoading(false);
    });
  }, [open, user.user_id, getActivity, getSessions]);

  const runAction = async (
    key: string,
    fn: () => Promise<{ error: string | null }>,
    successTitle: string,
    successDescription: string,
  ) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Action failed', description: res.error });
      return false;
    }
    toast({ title: successTitle, description: successDescription });
    onChanged();
    return true;
  };

  const metrics = activity
    ? [
        { label: 'Posts', value: activity.posts, icon: FileText },
        { label: 'Comments', value: activity.comments, icon: MessageSquare },
        { label: 'Reels', value: activity.reels, icon: Clapperboard },
        { label: 'Books', value: activity.books, icon: BookOpen },
        { label: 'Stars given', value: activity.stars_given, icon: Star },
        { label: 'Following', value: activity.following, icon: Users },
        { label: 'Followers', value: activity.followers, icon: Users },
        { label: 'Reports filed', value: activity.reports_filed, icon: Flag },
        { label: 'Reports received', value: activity.reports_received, icon: Flag },
        { label: 'Verify requests', value: activity.verification_requests, icon: BadgeCheck },
      ]
    : [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-lg">
                  {(user.display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  {user.display_name}
                  {user.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                </SheetTitle>
                <SheetDescription className="flex flex-col gap-1">
                  <span>@{user.username}</span>
                  {user.email && (
                    <span className="flex items-center gap-1 text-xs">
                      <Mail className="h-3 w-3" /> {user.email}
                    </span>
                  )}
                </SheetDescription>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="outline">{getRoleLabel(user.role)}</Badge>
                  {isBanned && <Badge variant="destructive">Suspended</Badge>}
                  {isShadowBanned && <Badge variant="secondary" className="bg-purple-500/15 text-purple-500">Shadow banned</Badge>}
                  <Badge variant={user.privacy === 'public' ? 'outline' : 'secondary'}>{user.privacy}</Badge>
                </div>
              </div>
            </div>
          </SheetHeader>

          <Separator />

          <div className="py-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Account actions</h4>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={busy !== null || !user.email}
                onClick={() => runAction(
                  'reset',
                  () => forcePasswordReset(user.email!),
                  'Reset email sent',
                  'A password reset link was emailed to the user.',
                )}
              >
                {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Force reset
              </Button>
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={busy !== null}
                onClick={() => runAction(
                  'logout',
                  () => logoutAllSessions(user.user_id),
                  'Sessions revoked',
                  'Every active session for this user was logged out.',
                )}
              >
                {busy === 'logout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Logout all
              </Button>
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={busy !== null || !canManageRoles}
                title={canManageRoles ? undefined : 'Requires Super Admin'}
                onClick={() => setShadowDialogOpen(true)}
              >
                {isShadowBanned ? <Ghost className="h-4 w-4 text-purple-500" /> : <Ghost className="h-4 w-4" />}
                {isShadowBanned ? 'Lift shadow ban' : 'Shadow ban'}
              </Button>
              {isBanned ? (
                <Button
                  variant="outline" size="sm" className="justify-start text-green-600 hover:text-green-700"
                  disabled={busy !== null || !isAdminLevel}
                  onClick={onRequestUnban}
                >
                  <ShieldOff className="h-4 w-4" />
                  Unsuspend
                </Button>
              ) : (
                <Button
                  variant="outline" size="sm" className="justify-start text-destructive hover:text-destructive"
                  disabled={busy !== null || !isAdminLevel}
                  title={isAdminLevel ? undefined : 'Requires Admin'}
                  onClick={onRequestBan}
                >
                  <Ban className="h-4 w-4" />
                  Suspend
                </Button>
              )}
            </div>
          </div>

          {isBanned && ban && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 mb-4 text-sm">
              <p className="font-semibold text-destructive mb-1 flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5" /> Active suspension
              </p>
              <p className="text-muted-foreground">
                {ban.reason} — {ban.expires_at ? `expires ${new Date(ban.expires_at).toLocaleString()}` : 'permanent'}
              </p>
            </div>
          )}

          <Separator />

          <div className="py-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Activity</h4>
            {loading || !activity ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {metrics.map(m => (
                  <div key={m.label} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-base font-bold leading-none">{m.value}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{m.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="py-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Sessions & devices</h4>
            {loading || !sessions ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No recorded sessions.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map(s => (
                  <div key={s.id} className="rounded-xl border border-border/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MonitorSmartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium truncate">
                          {s.device_name || (s.device_type === 'mobile' ? 'Mobile device' : 'Web session')}
                        </p>
                      </div>
                      {s.is_current && <Badge>Current</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {s.ip_address && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{s.ip_address}</span>}
                      {s.location && <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />{s.location}</span>}
                      {s.last_active_at && <span>· {new Date(s.last_active_at).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="py-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Joined</h4>
            <p className="text-sm">{new Date(user.created_at).toLocaleString()}</p>
          </div>

          {isAdminLevel && (
            <div className="pb-6">
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy !== null}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete account
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={shadowDialogOpen} onOpenChange={setShadowDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isShadowBanned ? 'Lift shadow ban' : 'Shadow ban user'}</DialogTitle>
            <DialogDescription>
              Shadow banned users keep using the app normally, but their content is hidden from everyone else.
            </DialogDescription>
          </DialogHeader>
          {!isShadowBanned && (
            <Textarea
              placeholder="Reason (visible to admins only)"
              rows={3}
              value={shadowReason}
              onChange={(e) => setShadowReason(e.target.value)}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShadowDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const ok = await runAction(
                  'shadow',
                  () => shadowBan(user.user_id, !isShadowBanned, shadowReason.trim() || undefined),
                  isShadowBanned ? 'Shadow ban lifted' : 'User shadow banned',
                  isShadowBanned ? 'Their content is visible again.' : 'Their content is now hidden from other users.',
                );
                if (ok) setShadowDialogOpen(false);
              }}
            >
              {busy === 'shadow' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isShadowBanned ? 'Lift shadow ban' : 'Confirm shadow ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete {user.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account, all posts, reels, books, comments and session data.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const ok = await runAction(
                  'delete',
                  () => deleteUser(user.user_id),
                  'User deleted',
                  'The account and all related data were removed.',
                );
                if (ok) setConfirmDeleteOpen(false);
              }}
            >
              {busy === 'delete' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
