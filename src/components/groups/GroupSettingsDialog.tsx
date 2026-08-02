import { useEffect, useRef, useState } from 'react';
import { Loader2, ImagePlus, X, Globe, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGroupActions, uploadGroupMedia, Group } from '@/hooks/useGroups';
import { useToast } from '@/hooks/use-toast';

interface GroupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
}

export default function GroupSettingsDialog({ open, onOpenChange, group }: GroupSettingsDialogProps) {
  const { toast } = useToast();
  const { updateGroup } = useGroupActions();

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [privacy, setPrivacy] = useState<'public' | 'private'>(group.privacy);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(group.avatar_url);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(group.cover_url);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription(group.description || '');
      setPrivacy(group.privacy);
      setAvatarFile(null);
      setAvatarPreview(group.avatar_url);
      setCoverFile(null);
      setCoverPreview(group.cover_url);
    }
  }, [open, group]);

  const handleImage = (
    file: File,
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void
  ) => {
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum size is 10MB.' });
      return;
    }
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (name.trim().length < 2 || saving) return;
    setSaving(true);
    try {
      let avatarUrl: string | null = group.avatar_url;
      let coverUrl: string | null = group.cover_url;

      if (avatarFile) {
        try {
          const uploaded = await uploadGroupMedia(avatarFile);
          avatarUrl = uploaded.url;
        } catch (err: any) {
          toast({ variant: 'destructive', title: 'Avatar upload failed', description: err?.message || 'Could not upload the avatar.' });
          setSaving(false);
          return;
        }
      }

      if (coverFile) {
        try {
          const uploaded = await uploadGroupMedia(coverFile);
          coverUrl = uploaded.url;
        } catch (err: any) {
          toast({ variant: 'destructive', title: 'Cover upload failed', description: err?.message || 'Could not upload the cover.' });
          setSaving(false);
          return;
        }
      }

      await updateGroup.mutateAsync({
        groupId: group.id,
        name: name.trim(),
        description: description.trim(),
        avatarUrl,
        coverUrl,
        privacy,
      });

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Group settings
          </DialogTitle>
          <DialogDescription>Manage the group's name, visuals and privacy.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Cover */}
          <div>
            <label className="text-sm font-medium mb-2 block">Cover photo</label>
            <div className="relative h-32 rounded-2xl overflow-hidden bg-surface border border-border/60">
              {coverPreview ? (
                <img src={coverPreview} alt="Group cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-primary/10 to-accent/5">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
              <button
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 text-xs font-bold bg-background/90 backdrop-blur border border-border rounded-lg px-3 py-2 hover:bg-background transition-colors"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {coverPreview ? 'Change' : 'Add cover'}
              </button>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImage(f, setCoverFile, setCoverPreview);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Group avatar"
                  className="w-20 h-20 rounded-2xl object-cover border border-border/60"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-surface border border-dashed border-border/70 flex items-center justify-center text-muted-foreground">
                  <Users className="h-8 w-8" />
                </div>
              )}
              {avatarPreview && (
                <button
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(null);
                  }}
                  className="absolute -top-2 -right-2 p-1 rounded-full bg-background border border-border shadow-sm hover:bg-muted transition-colors"
                  aria-label="Remove avatar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                className="gap-2"
              >
                <ImagePlus className="h-4 w-4" />
                Change avatar
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">Optional · up to 10MB</p>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImage(f, setAvatarFile, setAvatarPreview);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Group name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="h-11"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Privacy</label>
            <Select value={privacy} onValueChange={(v) => setPrivacy(v as 'public' | 'private')}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Public — anyone can view and join
                  </span>
                </SelectItem>
                <SelectItem value="private">
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Private — only members can see posts
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={name.trim().length < 2 || saving || updateGroup.isPending}
            >
              {saving || updateGroup.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
