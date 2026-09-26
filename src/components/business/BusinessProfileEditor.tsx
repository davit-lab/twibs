import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useToast } from '@/components/ui/use-toast';
import { useBusiness } from '@/contexts/BusinessContext';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { useBusinessAssetUpload } from '@/hooks/useBusinessAssetUpload';
import type { BusinessAccount } from '@/lib/business';
import { friendlyErrorMessage } from '@/lib/errors';
import { Camera, Loader2, Trash2 } from 'lucide-react';

export interface BusinessProfileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The business being edited. Pass this when opened from a business profile,
   * because the target is not necessarily the *active* identity. When omitted
   * the editor falls back to the active business.
   */
  account?: BusinessAccount | null;
}

const CATEGORIES = [
  'Technology',
  'Finance',
  'Health & Fitness',
  'Education',
  'Entertainment',
  'Retail',
  'Food & Drink',
  'Travel',
  'Automotive',
  'Real Estate',
  'Fashion',
  'Sports',
  'Art & Design',
  'Media',
  'Nonprofit',
  'Other',
];

const MAX_DESCRIPTION = 500;
const MAX_NAME = 100;

/**
 * Owner/admin editor for a business identity: text profile plus avatar and
 * cover change/removal.
 *
 * Saving is a single update_business_profile call so the profile, the media
 * URLs and the active account in BusinessContext all move together — a failure
 * leaves the previously saved profile fully intact rather than half-updated.
 */
export default function BusinessProfileEditor({ open, onOpenChange, account }: BusinessProfileEditorProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeBusiness, patchAccount } = useBusiness();
  const queryClient = useQueryClient();
  const api = useBusinessApi();
  const { upload, remove } = useBusinessAssetUpload();

  // Prefer the explicitly supplied business; otherwise edit the active one.
  // When the target is also the active identity, use the context copy so the
  // latest values (e.g. a just-uploaded avatar) are picked up.
  const target = useMemo<BusinessAccount | null>(() => {
    if (account) {
      return activeBusiness?.id === account.id ? { ...account, ...activeBusiness } : account;
    }
    return activeBusiness;
  }, [account, activeBusiness]);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarDialog, setAvatarDialog] = useState(false);
  const [coverDialog, setCoverDialog] = useState(false);
  const [removingMedia, setRemovingMedia] = useState<'avatar' | 'cover' | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Load current values once per business, so reopening never shows stale text.
  useEffect(() => {
    if (!open || !target) return;
    if (loadedFor.current === target.id) return;
    loadedFor.current = target.id;
    setName(target.name ?? '');
    setUsername(target.username ?? '');
    setCategory(target.category ?? '');
    setDescription(target.description ?? '');
    setWebsite(target.website ?? '');
    setLocation(target.location ?? '');
  }, [open, target]);

  const reset = useCallback(() => {
    loadedFor.current = null;
    setSaving(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedWebsite = website.trim();

    if (!trimmedName) e.name = 'Name is required.';
    else if (trimmedName.length > MAX_NAME) e.name = `Keep the name under ${MAX_NAME} characters.`;

    if (!trimmedUsername) e.username = 'Username is required.';
    else if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      e.username = 'Use 3-30 letters, numbers or underscores.';
    }

    if (trimmedWebsite && !/^https?:\/\//i.test(trimmedWebsite)) {
      e.website = 'Website must start with http:// or https://';
    }
    if (description.length > MAX_DESCRIPTION) {
      e.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
    }
    return e;
  }, [name, username, website, description]);

  const isValid = Object.keys(errors).length === 0;

  // A save has to update two different caches:
  //  - the BusinessContext list, which feeds the switcher and active-business
  //    consumers, and
  //  - the public profile query, which is what actually renders this page.
  // Patching only the context left a non-active business showing pre-edit data
  // until a manual refetch, so both are refreshed together on every mutation.
  const syncAccount = useCallback(
    (updated: Partial<BusinessAccount>) => {
      if (!target) return;
      patchAccount(target.id, updated);
      void queryClient.invalidateQueries({ queryKey: ['business-profile'] });
    },
    [target, patchAccount, queryClient]
  );

  const handleUpload = useCallback(
    async (kind: 'avatar' | 'cover', file: File, blob: Blob) => {
      if (!target) throw new Error('No business selected.');
      const url = await upload({ kind, file, businessId: target.id, blob });

      // Persist immediately so a refresh keeps the new media even if the user
      // never presses Save on the text fields.
      const updated = await api.updateBusinessProfile(target.id, {
        [kind === 'avatar' ? 'avatar_url' : 'cover_url']: url,
      });
      syncAccount(updated as Partial<BusinessAccount>);
      return url;
    },
    [target, upload, api, syncAccount]
  );

  const handleRemove = useCallback(
    async (kind: 'avatar' | 'cover') => {
      if (!target) return;
      const current = kind === 'avatar' ? target.avatar_url : target.cover_url;
      setRemovingMedia(kind);
      try {
        const updated = await api.updateBusinessProfile(target.id, {
          [kind === 'avatar' ? 'clear_avatar' : 'clear_cover']: true,
        } as Parameters<typeof api.updateBusinessProfile>[1]);
        // Best-effort cleanup of the orphaned object; a failure here must not
        // leave the profile showing an image the user just removed.
        try {
          await remove(current, kind);
        } catch {
          /* storage object will be cleaned up separately */
        }
        syncAccount(updated as Partial<BusinessAccount>);
        toast({ title: `${kind === 'avatar' ? 'Profile picture' : 'Cover'} removed.` });
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Could not remove media',
          description: friendlyErrorMessage(err, 'Please try again.'),
        });
      } finally {
        setRemovingMedia(null);
      }
    },
    [target, api, syncAccount, remove, toast]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !isValid || saving) return;

    setSaving(true);
    try {
      const updated = await api.updateBusinessProfile(target.id, {
        name: name.trim(),
        username: username.trim(),
        category,
        // Empty string clears these server-side; omitting them would keep the
        // old value, so always send the current field contents.
        description: description.trim(),
        website: website.trim(),
        location: location.trim(),
      });
      syncAccount(updated as Partial<BusinessAccount>);
      toast({ title: 'Profile updated' });
      handleOpenChange(false);
      // The username is part of the public URL, so move the viewer to the
      // canonical profile rather than leaving them on a stale URL.
      if (updated.username && updated.username !== target.username) {
        navigate(`/business/${updated.username}`);
      }
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save profile',
        description: friendlyErrorMessage(err, 'Please try again.'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!target) return null;

  const avatarPreview = target.avatar_url;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit business profile</DialogTitle>
            <DialogDescription>
              This is how {target.name} appears across Twibs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Cover */}
            <div className="space-y-2">
              <Label>Cover photo</Label>
              <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                <div className="aspect-[16/5] w-full">
                  {target.cover_url ? (
                    <img src={target.cover_url} alt="Cover preview" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="absolute right-2 top-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCoverDialog(true)}
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    Change
                  </Button>
                  {target.cover_url ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRemove('cover')}
                      disabled={removingMedia !== null}
                    >
                      {removingMedia === 'cover' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">Remove cover</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Avatar */}
            <div className="space-y-2">
              <Label>Profile picture</Label>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setAvatarDialog(true)}
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    Change
                  </Button>
                  {avatarPreview ? (
                    <Button
                      type="button"
                      size="sm"
                    variant="secondary"
                    onClick={() => handleRemove('avatar')}
                    disabled={removingMedia !== null}
                    >
                    {removingMedia === 'avatar' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">Remove profile picture</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bpe-name">Name</Label>
                <Input
                  id="bpe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bpe-username">Username</Label>
                <Input
                  id="bpe-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={Boolean(errors.username)}
                />
                {errors.username ? <p className="text-xs text-destructive">{errors.username}</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bpe-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="bpe-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bpe-description">About</Label>
              <Textarea
                id="bpe-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                aria-invalid={Boolean(errors.description)}
              />
              <div className="flex justify-between">
                {errors.description ? (
                  <p className="text-xs text-destructive">{errors.description}</p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-muted-foreground">
                  {description.length}/{MAX_DESCRIPTION}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bpe-website">Website</Label>
                <Input
                  id="bpe-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  aria-invalid={Boolean(errors.website)}
                />
                {errors.website ? <p className="text-xs text-destructive">{errors.website}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bpe-location">Location</Label>
                <Input
                  id="bpe-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={avatarDialog}
        onOpenChange={setAvatarDialog}
        label="profile picture"
        aspect={1}
        outputWidth={800}
        outputHeight={800}
        onUpload={(file, blob) => handleUpload('avatar', file, blob)}
      />
      <ImageCropDialog
        open={coverDialog}
        onOpenChange={setCoverDialog}
        label="cover photo"
        aspect={16 / 5}
        outputWidth={1920}
        outputHeight={600}
        onUpload={(file, blob) => handleUpload('cover', file, blob)}
      />
    </>
  );
}
