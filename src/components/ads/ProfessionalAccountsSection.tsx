import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAdvertiserAccounts,
  type AdvertiserAccountInput,
} from '@/hooks/useAdvertiserAccounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Mic,
  Megaphone,
  Loader2,
  Pencil,
  ExternalLink,
  UserPlus,
  Upload,
  Trash2,
  Layers,
} from 'lucide-react';
import type { AdvertiserAccount, AdvertiserAccountType } from '@/lib/ads';

const CATEGORIES = [
  'Brand',
  'Local business',
  'Online store',
  'Service',
  'Creator',
  'Influencer',
  'Media',
  'Non-profit',
  'Other',
];

function AccountTypeBadge({ type }: { type: AdvertiserAccountType }) {
  const isBusiness = type === 'business';
  return (
    <span
      className={
        isBusiness
          ? 'inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-600'
          : 'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'
      }
    >
      {isBusiness ? <Building2 className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
      {isBusiness ? 'Business' : 'Creator'}
    </span>
  );
}

function AccountFormDialog({
  open,
  onOpenChange,
  type,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: AdvertiserAccountType;
  existing?: AdvertiserAccount | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const { createAccount, updateAccount, uploadAvatar } = useAdvertiserAccounts();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AdvertiserAccountInput>({
    account_type: type,
    name: existing?.name ?? '',
    username: existing?.username ?? '',
    category: existing?.category ?? '',
    description: existing?.description ?? '',
    avatar_url: existing?.avatar_url ?? profile?.avatar_url ?? '',
    cover_url: existing?.cover_url ?? '',
    website: existing?.website ?? '',
    contact_email: existing?.contact_email ?? '',
    contact_phone: existing?.contact_phone ?? '',
    location: existing?.location ?? '',
  });

  const isBusiness = type === 'business';
  const title = existing
    ? `Edit ${isBusiness ? 'Business' : 'Creator'} Account`
    : `Create ${isBusiness ? 'Business' : 'Creator'} Account`;

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file || !existing) {
      if (!file) return;
      toast({ variant: 'destructive', title: 'Save the account first', description: 'Create the account, then add a profile photo.' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(existing.id, file);
      setForm((f) => ({ ...f, avatar_url: url }));
      toast({ title: 'Photo uploaded', description: 'Photo will be saved with the account.' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err instanceof Error ? err.message : 'Failed to upload photo.' });
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!form.name.trim()) {
        toast({ variant: 'destructive', title: 'Name is required' });
        return;
      }
      if (!form.username.trim()) {
        toast({ variant: 'destructive', title: 'Username is required' });
        return;
      }
      if (existing) {
        await updateAccount(existing.id, form);
      } else {
        await createAccount(form);
      }
      toast({ title: existing ? 'Account updated' : 'Account created' });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof AdvertiserAccountInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This becomes your advertising identity. Ad campaigns you run will be
            shown as this {isBusiness ? 'business' : 'creator'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarImage src={form.avatar_url || undefined} />
              <AvatarFallback>
                {form.name.trim().slice(0, 2).toUpperCase() || (isBusiness ? 'B' : 'C')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploading || !existing}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload photo
                </Button>
                <Label htmlFor="ad-avatar" className="text-xs text-muted-foreground">
                  …or paste a URL
                </Label>
              </div>
              <Input
                id="ad-avatar"
                placeholder="https://…"
                value={form.avatar_url ?? ''}
                onChange={(e) => set('avatar_url', e.target.value)}
              />
              {!existing && (
                <p className="text-xs text-muted-foreground">
                  Create the account first, then you can upload a photo.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-name">{isBusiness ? 'Business name' : 'Creator name'} *</Label>
              <Input
                id="ad-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                maxLength={100}
                placeholder={isBusiness ? 'Acme Inc.' : 'Your creator name'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-username">Username *</Label>
              <div className="flex items-center rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
                <span className="pl-3 text-sm text-muted-foreground">@</span>
                <input
                  id="ad-username"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  maxLength={30}
                  placeholder={isBusiness ? 'acme' : 'creator'}
                  className="flex h-10 w-full rounded-md bg-transparent px-2 py-2 text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-category">Category</Label>
            <select
              id="ad-category"
              value={form.category ?? ''}
              onChange={(e) => set('category', e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-description">Description</Label>
            <Textarea
              id="ad-description"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              maxLength={500}
              placeholder="What is this account about?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-website">Website</Label>
              <Input
                id="ad-website"
                placeholder="https://example.com"
                value={form.website ?? ''}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-location">Location</Label>
              <Input
                id="ad-location"
                placeholder="City, Country"
                value={form.location ?? ''}
                onChange={(e) => set('location', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-email">Contact email</Label>
              <Input
                id="ad-email"
                type="email"
                placeholder="hello@acme.com"
                value={form.contact_email ?? ''}
                onChange={(e) => set('contact_email', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-phone">Contact phone</Label>
              <Input
                id="ad-phone"
                placeholder="+1 555 000 0000"
                value={form.contact_phone ?? ''}
                onChange={(e) => set('contact_phone', e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {existing ? 'Save changes' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfessionalAccountsSection() {
  const { accounts, loading, error, refresh, deleteAccount } = useAdvertiserAccounts();
  const { toast } = useToast();
  const [createType, setCreateType] = useState<AdvertiserAccountType | null>(null);
  const [editing, setEditing] = useState<AdvertiserAccount | null>(null);
  const [deleting, setDeleting] = useState<AdvertiserAccount | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const business = accounts.filter((a) => a.account_type === 'business');
  const creators = accounts.filter((a) => a.account_type === 'creator');

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteAccount(deleting.id);
      toast({ title: 'Account deleted', description: `"${deleting.name}" has been removed.` });
      setDeleting(null);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Professional</h2>
        <p className="text-sm text-muted-foreground">
          Create a business or creator identity to run ads and boost posts.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreateType('business')} className="gap-2">
          <Building2 className="h-4 w-4" />
          Create Business Account
        </Button>
        <Button onClick={() => setCreateType('creator')} variant="outline" className="gap-2">
          <Mic className="h-4 w-4" />
          Create Creator Account
        </Button>
        <Button variant="ghost" asChild className="gap-2">
          <Link to="/ads">
            <Megaphone className="h-4 w-4" />
            Open Ads Manager
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
        <Layers className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <p>
          You can create as many professional accounts as you need — one per brand
          or persona. Pick which account to advertise as when you create a campaign.
        </p>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load your professional accounts. Please try again.
        </p>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-center">
          <p className="font-semibold">No professional accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a business or creator account to start advertising.
          </p>
        </div>
      )}

      {business.length > 0 && (
        <AccountList
          title="Business Accounts"
          icon={<Building2 className="h-4 w-4" />}
          accounts={business}
          onEdit={(a) => setEditing(a)}
          onDelete={(a) => setDeleting(a)}
        />
      )}

      {creators.length > 0 && (
        <AccountList
          title="Creator Accounts"
          icon={<Mic className="h-4 w-4" />}
          accounts={creators}
          onEdit={(a) => setEditing(a)}
          onDelete={(a) => setDeleting(a)}
        />
      )}

      {createType && (
        <AccountFormDialog
          open={true}
          onOpenChange={(open) => !open && setCreateType(null)}
          type={createType}
          onSaved={refresh}
        />
      )}

      {editing && (
        <AccountFormDialog
          open={true}
          onOpenChange={(open) => !open && setEditing(null)}
          type={editing.account_type}
          existing={editing}
          onSaved={refresh}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the professional account permanently. Any finished
              campaigns linked to it are also removed. Campaigns that are still
              running must be ended or cancelled first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountList({
  title,
  icon,
  accounts,
  onEdit,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  accounts: AdvertiserAccount[];
  onEdit: (account: AdvertiserAccount) => void;
  onDelete: (account: AdvertiserAccount) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4"
          >
            <Avatar className="h-11 w-11">
              <AvatarImage src={account.avatar_url || undefined} />
              <AvatarFallback>{account.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{account.name}</p>
                <AccountTypeBadge type={account.account_type} />
                {account.status === 'suspended' && (
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600">
                    Suspended
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                @{account.username}
                {account.category ? ` · ${account.category}` : ''}
              </p>
              {account.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {account.description}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => onEdit(account)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" asChild className="gap-1.5">
                <Link to="/ads">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ads
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                title="Delete account"
                onClick={() => onDelete(account)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
