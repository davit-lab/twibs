import { useState } from 'react';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  useBusinessSettings,
  useBusinessMembers,
  useUpdateBusinessSettings,
  useUpdateBusinessProfile,
  useAddBusinessMember,
  useUpdateBusinessMemberRole,
  useRemoveBusinessMember,
} from '@/hooks/useBusinessData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import BusinessProfileEditor from '@/components/business/BusinessProfileEditor';
import { Loader2, Save, ShieldCheck, UserPlus, Trash2, ChevronDown, Pencil } from 'lucide-react';
import {
  BUSINESS_GOALS,
  PRIORITY_META,
  ROLE_META,
  type BusinessRole,
  type DiscoveryPriority,
} from '@/lib/business';

const EDIT_ROLES: BusinessRole[] = ['admin', 'advertiser', 'analyst'];

export function SettingsTab({ businessId }: { businessId: string }) {
  const { activeBusiness, canManage, role } = useBusiness();
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useBusinessSettings(businessId);
  const { data: members, isLoading: membersLoading } = useBusinessMembers(businessId);
  const updateSettings = useUpdateBusinessSettings(businessId);
  const updateProfile = useUpdateBusinessProfile(businessId);
  const addMember = useAddBusinessMember(businessId);
  const updateRole = useUpdateBusinessMemberRole(businessId);
  const removeMember = useRemoveBusinessMember(businessId);

  const [priority, setPriority] = useState<DiscoveryPriority | null>(null);
  const [expansion, setExpansion] = useState<boolean | null>(null);

  const [goals, setGoals] = useState<string[]>(activeBusiness?.goals || []);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<BusinessRole>('advertiser');
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  const toggleGoal = (goal: string) =>
    setGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));

  const saveGoals = async () => {
    try {
      await updateProfile.mutateAsync({ goals });
      toast({ title: 'Goals saved' });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save goals',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  };

  const saveSettings = async () => {
    try {
      await updateSettings.mutateAsync({
        discovery_priority: priority ?? undefined,
        audience_expansion: expansion ?? undefined,
      });
      setPriority(null);
      setExpansion(null);
      toast({ title: 'Settings saved', description: 'Your distribution preferences were updated.' });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save settings',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  };

  const invite = async () => {
    if (!inviteUsername.trim()) return;
    try {
      await addMember.mutateAsync({ username: inviteUsername.trim().replace(/^@/, ''), role: inviteRole });
      setInviteUsername('');
      toast({ title: 'Member added' });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not add member',
        description: err instanceof Error ? err.message : 'That username was not found.',
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Profile */}
      <Card className="rounded-2xl xl:col-span-2">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <p className="font-semibold">Business profile</p>
            {!canManage && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">Read-only</span>}
          </div>

          {/* Name, bio, avatar and cover are edited in one shared dialog so the
              settings surface and the public profile can never drift apart. */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarImage src={activeBusiness?.avatar_url || undefined} alt={activeBusiness?.name} className="object-cover" />
              <AvatarFallback>{(activeBusiness?.name || 'B').charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{activeBusiness?.name}</p>
              <p className="truncate text-sm text-muted-foreground">@{activeBusiness?.username}</p>
            </div>
            {/* Only owners/admins can edit. The RPC enforces this too, but
                showing an enabled button under a "Read-only" badge invited a
                save that could only ever be rejected. */}
            {canManage && (
              <Button
                variant="outline"
                onClick={() => setProfileEditorOpen(true)}
                className="gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                Edit profile
              </Button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Goals</Label>
              <div className="flex flex-wrap gap-1.5">
                {BUSINESS_GOALS.map((goal) => {
                  const active = goals.includes(goal);
                  return (
                    <button
                      key={goal}
                      onClick={() => canManage && toggleGoal(goal)}
                      className={
                        active
                          ? 'rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary'
                          : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {goal}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {canManage && (
            <Button onClick={saveGoals} className="mt-5 gap-1.5" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save goals
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Distribution */}
      {canManage && (
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <p className="mb-4 flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Reach & discovery
            </p>
            {settingsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <Label>Discovery priority</Label>
                <Select
                  value={priority ?? settings?.discovery_priority ?? 'normal'}
                  onValueChange={(v) => setPriority(v as DiscoveryPriority)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_META) as DiscoveryPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">{PRIORITY_META[priority ?? settings?.discovery_priority ?? 'normal'].description}</p>

                <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-border p-3.5">
                  <span>
                    <span className="text-sm font-medium">Audience expansion</span>
                    <span className="block text-xs text-muted-foreground">Show content to audiences related to yours.</span>
                  </span>
                  <Switch
                    checked={expansion ?? settings?.audience_expansion ?? true}
                    onCheckedChange={setExpansion}
                  />
                </div>

                <Button onClick={saveSettings} className="mt-4 gap-1.5" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save distribution
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team */}
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <p className="mb-1 font-semibold">Team</p>
          <p className="mb-4 text-xs text-muted-foreground">Your role: {role ? ROLE_META[role].label : 'Member'}</p>

          {canManage && (
            <div className="mb-5 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="invite-user">Invite by username</Label>
                <Input
                  id="invite-user"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="@username"
                />
              </div>
              <div className="w-32 space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as BusinessRole)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDIT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_META[r].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={invite} disabled={addMember.isPending} className="gap-1.5">
                {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Invite
              </Button>
            </div>
          )}

          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading team…</p>
          ) : !members || members.length === 0 ? (
            <p className="text-sm text-muted-foreground">You're the only member — invite teammates to help manage the business.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                return (
                  <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={m.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{(m.display_name || m.username || 'U')[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.display_name || m.username}</p>
                      <p className="truncate text-xs text-muted-foreground">@{m.username}</p>
                    </div>
                    {canManage && m.role !== 'owner' ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          updateRole.mutate(
                            { userId: m.user_id, role: v as BusinessRole },
                            {
                              onSuccess: () => toast({ title: 'Role updated' }),
                              onError: (err) =>
                                toast({ variant: 'destructive', title: 'Could not update role', description: err.message }),
                            }
                          )
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EDIT_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_META[r].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{ROLE_META[m.role].label}</span>
                    )}
                    {canManage && m.role !== 'owner' && (
                      <button
                        onClick={() =>
                          removeMember.mutate(m.user_id, {
                            onSuccess: () => toast({ title: 'Member removed' }),
                            onError: (err) => toast({ variant: 'destructive', title: 'Could not remove member', description: err.message }),
                          })
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <BusinessProfileEditor
        open={profileEditorOpen}
        onOpenChange={setProfileEditorOpen}
        account={activeBusiness}
      />
    </div>
  );
}