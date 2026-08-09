import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '@/components/ui/pagination';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import {
  Search, Loader2, MoreHorizontal, BadgeCheck, UserX, UserCheck, Gift, Crown,
  Ban, ShieldOff, Trash2, Eye, KeyRound, LogOut, Ghost, Hammer,
} from 'lucide-react';
import { AdminUser, UserBan, ROLE_OPTIONS, ROLE_HIERARCHY, getRoleLabel } from './types';
import UserDetailDrawer from './UserDetailDrawer';

interface SubscriptionPlan { id: string; name: string; tier: string; }

const PAGE_SIZE = 12;

export default function AdminUsersTab() {
  const { user: currentUser, isAdmin: isAdminUser, isSuperAdmin, isModerator } = useAuth();
  const { setRole, logoutAllSessions, shadowBan, deleteUser, forcePasswordReset, getEmails, writeAudit } = useAdminActions();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [bans, setBans] = useState<UserBan[]>([]);
  const [shadowBannedIds, setShadowBannedIds] = useState<string[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);
  const [banUser, setBanUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('7d');
  const [banLoading, setBanLoading] = useState(false);
  const [giftingUser, setGiftingUser] = useState<AdminUser | null>(null);
  const [giftingLoading, setGiftingLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManageRoles = isSuperAdmin;
  const canModerate = isAdminUser || isModerator || isSuperAdmin;
  const canAdminActions = isAdminUser || isSuperAdmin;

  const loadStatic = useCallback(async () => {
    const [{ data: bansData }, { data: shadowData }, { data: plansData }] = await Promise.all([
      (supabase as any).from('user_bans').select('*').eq('is_active', true),
      (supabase as any).from('user_shadow_bans').select('user_id').eq('is_active', true),
      (supabase as any).from('subscription_plans').select('id, name, tier').eq('is_active', true),
    ]);
    setBans((bansData || []) as UserBan[]);
    setShadowBannedIds((shadowData || []).map((s: any) => s.user_id));
    setPlans(plansData || []);
  }, []);

  const loadUsers = useCallback(async (currentSearch: string, currentRole: string, currentPage: number) => {
    setLoading(true);
    try {
      let profileIds: string[] | null = null;
      if (currentRole !== 'all') {
        const { data: roleRows } = await (supabase as any)
          .from('user_roles')
          .select('user_id')
          .eq('role', currentRole);
        profileIds = (roleRows || []).map((r: any) => r.user_id);
      }

      let query = (supabase as any)
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (currentSearch.trim()) {
        const term = `%${currentSearch.trim().toLowerCase()}%`;
        query = query.or(`display_name.ilike.${term},username.ilike.${term}`);
      }
      if (profileIds) {
        if (!profileIds.length) {
          setUsers([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        query = query.in('user_id', profileIds);
      }

      const from = currentPage * PAGE_SIZE;
      const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const pageUsers = (data || []) as AdminUser[];
      const ids = pageUsers.map(p => p.user_id);

      const [{ data: rolesData }, emailMap] = await Promise.all([
        (supabase as any).from('user_roles').select('user_id, role').in('user_id', ids),
        getEmails(ids),
      ]);

      const roleMap = new Map<string, string>((rolesData || []).map((r: any) => [r.user_id, r.role]));
      const enriched = pageUsers.map(p => ({
        ...p,
        email: emailMap[p.user_id],
        role: roleMap.get(p.user_id) || 'user',
        role_hierarchy: ROLE_HIERARCHY[roleMap.get(p.user_id) || 'user'] ?? 1,
      }));

      setUsers(enriched);
      setTotal(count ?? 0);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load users.' });
    } finally {
      setLoading(false);
    }
  }, [getEmails]);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);

  useEffect(() => {
    loadUsers(search, roleFilter, page);
  }, [search, roleFilter, page, loadUsers]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeRole = async (target: AdminUser, newRole: string) => {
    if (!canManageRoles) return;
    setBusyId(target.user_id);
    const res = await setRole(target.user_id, newRole as any);
    setBusyId(null);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Failed to change role', description: res.error });
      return;
    }
    setUsers(prev => prev.map(u => (u.user_id === target.user_id ? { ...u, role: newRole } : u)));
    toast({ title: 'Role updated', description: `${target.display_name} is now ${getRoleLabel(newRole)}.` });
  };

  const toggleVerification = async (target: AdminUser) => {
    setBusyId(target.user_id);
    const next = !target.is_verified;
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ is_verified: next })
      .eq('user_id', target.user_id);
    if (!error) {
      await writeAudit(next ? 'verify_user' : 'unverify_user', 'user', target.user_id);
    }
    setBusyId(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    setUsers(prev => prev.map(u => (u.user_id === target.user_id ? { ...u, is_verified: next } : u)));
    toast({ title: 'Success', description: `Verification ${next ? 'granted' : 'removed'}.` });
  };

  const unban = async (target: AdminUser) => {
    setBusyId(target.user_id);
    const { error } = await (supabase as any)
      .from('user_bans')
      .update({ is_active: false })
      .eq('user_id', target.user_id)
      .eq('is_active', true);
    if (!error) {
      await writeAudit('unban_user', 'user', target.user_id);
      setBans(prev => prev.filter(b => b.user_id !== target.user_id));
    }
    setBusyId(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    toast({ title: 'Unsuspended', description: `${target.display_name} can use the platform again.` });
  };

  const ban = async () => {
    if (!banUser || !banReason.trim()) {
      toast({ variant: 'destructive', title: 'Required', description: 'A reason is required to suspend.' });
      return;
    }
    setBanLoading(true);
    const durationMap: Record<string, string | null> = {
      '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days', '90d': '90 days', permanent: null,
    };
    const msMap: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000 };
    const expiresAt = durationMap[banDuration] === null ? null : new Date(Date.now() + msMap[banDuration]).toISOString();

    const { error } = await (supabase as any).from('user_bans').insert({
      user_id: banUser.user_id,
      banned_by: currentUser?.id,
      reason: banReason.trim(),
      expires_at: expiresAt,
    });
    if (!error) {
      await writeAudit('suspend_user', 'user', banUser.user_id, { reason: banReason.trim(), duration: banDuration, expires_at: expiresAt });
      setBans(prev => [...prev.filter(b => b.user_id !== banUser.user_id), {
        id: String(Math.random()), user_id: banUser.user_id, banned_by: currentUser?.id || '', reason: banReason.trim(),
        banned_at: new Date().toISOString(), expires_at: expiresAt, is_active: true,
      }]);
      setBanUser(null);
      setBanReason('');
      setBanDuration('7d');
      toast({ title: 'User suspended', description: `${banUser.display_name} suspended for ${durationMap[banDuration] ?? 'the indefinite future'}.` });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
    setBanLoading(false);
  };

  const gift = async (userId: string, planId: string) => {
    setGiftingLoading(true);
    try {
      const { data: existing } = await (supabase as any)
        .from('subscriptions').select('id').eq('user_id', userId).maybeSingle();
      const data = {
        user_id: userId, plan_id: planId, status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const { error } = existing
        ? await (supabase as any).from('subscriptions').update(data).eq('id', existing.id)
        : await (supabase as any).from('subscriptions').insert(data);
      if (error) throw error;
      await writeAudit('gift_subscription', 'user', userId, { plan_id: planId });
      setGiftingUser(null);
      toast({ title: 'Success', description: 'Subscription gifted!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Failed to gift subscription.' });
    } finally {
      setGiftingLoading(false);
    }
  };

  const removeUser = async (target: AdminUser) => {
    setBusyId(target.user_id);
    const res = await deleteUser(target.user_id);
    setBusyId(null);
    if (res.error) {
      toast({ variant: 'destructive', title: 'Failed to delete user', description: res.error });
      return;
    }
    setUsers(prev => prev.filter(u => u.user_id !== target.user_id));
    setBans(prev => prev.filter(b => b.user_id !== target.user_id));
    toast({ title: 'User deleted', description: 'The account and all data were removed.' });
  };

  const isBanned = (id: string) => bans.some(b => b.user_id === id && b.is_active);
  const banInfo = (id: string) => bans.find(b => b.user_id === id && b.is_active);
  const isShadowed = (id: string) => shadowBannedIds.includes(id);

  const openDrawer = (u: AdminUser) => setDrawerUser(u);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Search, filter and manage accounts with granular role controls</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 lg:ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or @username..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 w-full sm:w-56"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No users match your filters.
                  </TableCell>
                </TableRow>
              ) : users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {(user.display_name || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium flex items-center gap-1">
                          {user.display_name}
                          {user.role === 'admin' && <Hammer className="w-3.5 h-3.5 text-amber-500" />}
                          {user.role === 'super_admin' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                          {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
                          {isBanned(user.user_id) && <Ban className="w-3.5 h-3.5 text-destructive" />}
                          {isShadowed(user.user_id) && <Ghost className="w-3.5 h-3.5 text-purple-500" />}
                        </p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManageRoles && user.user_id !== currentUser?.id ? (
                      <Select value={user.role} onValueChange={(v) => changeRole(user, v)}>
                        <SelectTrigger className="w-[130px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} disabled={o.value === 'super_admin' && user.role === 'super_admin'}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={user.role === 'super_admin' || user.role === 'admin' ? 'default' : user.role === 'moderator' ? 'secondary' : 'outline'}
                        className={user.role === 'super_admin' ? 'bg-amber-500 hover:bg-amber-600' : user.role === 'admin' ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' : ''}
                      >
                        {user.role === 'super_admin' && <Crown className="w-3 h-3 mr-1" />}
                        {getRoleLabel(user.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {isBanned(user.user_id) ? (
                        <Badge variant="destructive" className="gap-1">
                          <Ban className="w-3 h-3" />
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="outline">{user.privacy}</Badge>
                      )}
                      {isShadowed(user.user_id) && (
                        <Badge variant="secondary" className="bg-purple-500/15 text-purple-500">
                          <Ghost className="w-3 h-3 mr-1" />
                          Shadow
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDrawer(user)} title="View details">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => openDrawer(user)}>
                            <Eye className="w-4 h-4 mr-2" /> View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyId === user.user_id || !user.email}
                            onClick={() => forcePasswordReset(user.email!).then(res => {
                              if (res.error) toast({ variant: 'destructive', title: 'Failed', description: res.error });
                              else toast({ title: 'Reset email sent', description: 'A password reset link was emailed.' });
                            })}
                          >
                            <KeyRound className="w-4 h-4 mr-2" /> Force password reset
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyId === user.user_id || !canModerate}
                            onClick={async () => {
                              setBusyId(user.user_id);
                              const res = await logoutAllSessions(user.user_id);
                              setBusyId(null);
                              if (res.error) toast({ variant: 'destructive', title: 'Failed', description: res.error });
                              else toast({ title: 'Sessions revoked', description: 'All sessions were logged out.' });
                            }}
                          >
                            <LogOut className="w-4 h-4 mr-2" /> Logout all sessions
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyId === user.user_id || !canAdminActions}
                            onClick={() => shadowBan(user.user_id, !isShadowed(user.user_id), 'From admin panel').then(res => {
                              if (res.error) toast({ variant: 'destructive', title: 'Failed', description: res.error });
                              else {
                                setShadowBannedIds(prev => isShadowed(user.user_id) ? prev.filter(i => i !== user.user_id) : [...prev, user.user_id]);
                                toast({ title: isShadowed(user.user_id) ? 'Shadow ban lifted' : 'User shadow banned' });
                              }
                            })}
                          >
                            <Ghost className="w-4 h-4 mr-2" /> {isShadowed(user.user_id) ? 'Lift shadow ban' : 'Shadow ban'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleVerification(user)}>
                            {user.is_verified
                              ? <UserX className="w-4 h-4 mr-2 text-muted-foreground" />
                              : <UserCheck className="w-4 h-4 mr-2 text-primary" />}
                            {user.is_verified ? 'Remove verification' : 'Verify user'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setGiftingUser(user)}>
                            <Gift className="w-4 h-4 mr-2 text-primary" /> Gift subscription
                          </DropdownMenuItem>
                          {isAdminUser && user.role !== 'admin' && user.role !== 'super_admin' && (
                            <>
                              <DropdownMenuSeparator />
                              {isBanned(user.user_id) ? (
                                <DropdownMenuItem onClick={() => unban(user)}>
                                  <ShieldOff className="w-4 h-4 mr-2 text-green-600" /> Unsuspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setBanUser(user)}>
                                  <Ban className="w-4 h-4 mr-2 text-destructive" /> Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => removeUser(user)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete user
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {total} user{total === 1 ? '' : 's'}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage(p => Math.max(0, p - 1)); }}
                  className={page === 0 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => (
                <PaginationItem key={i}>
                  <PaginationLink
                    href="#"
                    isActive={page === i}
                    onClick={(e) => { e.preventDefault(); setPage(i); }}
                  >
                    {i + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages - 1, p + 1)); }}
                  className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </CardContent>

      {/* Ban dialog */}
      <Dialog open={!!banUser} onOpenChange={(open) => { if (!open) { setBanUser(null); setBanReason(''); setBanDuration('7d'); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Suspend {banUser?.display_name}
            </DialogTitle>
            <DialogDescription>
              Suspension blocks the account for the chosen duration. A reason is required for the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason for suspension</Label>
              <Textarea
                id="ban-reason"
                placeholder="e.g. repeated hateful content"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ban-duration">Duration</Label>
              <Select value={banDuration} onValueChange={setBanDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={ban} disabled={banLoading || !banReason.trim()}>
              {banLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift dialog */}
      <Dialog open={!!giftingUser} onOpenChange={(open) => !open && setGiftingUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gift Subscription</DialogTitle>
            <DialogDescription>
              Gift a plan to {giftingUser?.display_name} (@{giftingUser?.username})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {plans.length === 0 && <p className="text-sm text-muted-foreground">No active plans available.</p>}
            {plans.map((plan) => (
              <Button
                key={plan.id}
                variant={plan.tier === 'premium' ? 'default' : 'outline'}
                className={plan.tier === 'premium' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                onClick={() => giftingUser && gift(giftingUser.user_id, plan.id)}
                disabled={giftingLoading}
              >
                {plan.tier === 'premium' && <Crown className="w-4 h-4 mr-2" />}
                {plan.name} ({plan.tier})
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <UserDetailDrawer
        user={drawerUser}
        open={!!drawerUser}
        onOpenChange={(open) => !open && setDrawerUser(null)}
        isBanned={drawerUser ? isBanned(drawerUser.user_id) : false}
        ban={drawerUser ? banInfo(drawerUser.user_id) || null : null}
        isShadowBanned={drawerUser ? isShadowed(drawerUser.user_id) : false}
        canManageRoles={canManageRoles}
        isAdminLevel={canAdminActions}
        onChanged={() => loadUsers(search, roleFilter, page)}
        onRequestBan={() => { if (drawerUser) { setBanUser(drawerUser); setDrawerUser(null); } }}
        onRequestUnban={() => { if (drawerUser) { const u = drawerUser; setDrawerUser(null); unban(u); } }}
      />
    </Card>
  );
}
