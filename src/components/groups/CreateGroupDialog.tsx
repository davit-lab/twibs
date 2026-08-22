import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ImagePlus, X, Users, Globe, Lock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useGroupActions, uploadGroupMedia } from '@/hooks/useGroups';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAME_MAX = 100;
const DESC_MAX = 500;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
      {children}
    </label>
  );
}

export default function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createGroup } = useGroupActions();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const nameValid = name.trim().length >= 2;
  const initial = name.trim().charAt(0)?.toUpperCase() || 'G';

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum size is 10MB.' });
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum size is 10MB.' });
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const clearAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      clearAvatar();
      clearCover();
      setName('');
      setDescription('');
      setPrivacy('public');
    }
    onOpenChange(open);
  };

  const handleCreate = async () => {
    if (!nameValid) return;

    setUploading(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        try {
          const uploaded = await uploadGroupMedia(avatarFile);
          avatarUrl = uploaded.url;
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: err?.message || 'Could not upload the avatar. Make sure the group-media storage bucket exists.',
          });
          setUploading(false);
          return;
        }
      }

      let coverUrl: string | undefined;
      if (coverFile) {
        try {
          const uploaded = await uploadGroupMedia(coverFile);
          coverUrl = uploaded.url;
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: err?.message || 'Could not upload the cover. Make sure the group-media storage bucket exists.',
          });
          setUploading(false);
          return;
        }
      }

      const group = await createGroup.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        avatarUrl,
        coverUrl,
        privacy,
      });

      handleClose(false);
      navigate(`/groups/${group.slug}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create a group</DialogTitle>
          <DialogDescription>
            A place where people can share, post and answer together.
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          {/* Cover */}
            <div>
            <div className="relative h-36 rounded-xl overflow-hidden bg-surface border border-border/60">
              {coverPreview ? (
                <img src={coverPreview} alt="Group cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-foreground/[0.03]">
                  <div className="text-center">
                    <ImagePlus className="h-6 w-6 mx-auto mb-1.5" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em]">No cover yet</p>
                  </div>
                </div>
              )}
              {coverPreview && (
                <button
                  onClick={clearCover}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-background/90 border border-border shadow-sm hover:bg-background transition-colors"
                  aria-label="Remove cover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 text-xs font-bold bg-foreground text-background rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {coverPreview ? 'Change' : 'Add cover'}
              </button>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverSelect}
              className="hidden"
            />
          </div>

          {/* Avatar + name */}
          <div className="flex items-center gap-4 mt-6">
            <div className="relative flex-shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Group avatar"
                  className="w-16 h-16 rounded-xl object-cover border border-border/60"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-foreground text-background flex items-center justify-center font-black text-2xl border border-border/60">
                  {initial}
                </div>
              )}
              {avatarPreview && (
                <button
                  onClick={clearAvatar}
                  className="absolute -top-2 -right-2 p-1 rounded-full bg-background border border-border shadow-sm hover:bg-muted transition-colors"
                  aria-label="Remove avatar"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
                aria-label="Upload avatar"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Georgian Tech Enthusiasts"
                maxLength={NAME_MAX}
                className="h-11"
              />
              <div className="flex items-center justify-between mt-1">
                <p className={cn('text-[11px] font-medium', !nameValid && name.trim().length > 0 && 'text-destructive')}>
                  {!nameValid && name.trim().length > 0 ? 'Minimum 2 characters' : ' '}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {name.length}/{NAME_MAX}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          {/* Description */}
          <div className="mt-5">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
              placeholder="What is this group about?"
              rows={3}
              className="resize-none"
            />
            <p className="font-mono text-[10px] text-muted-foreground text-right mt-1">
              {description.length}/{DESC_MAX}
            </p>
          </div>

          {/* Privacy */}
          <div className="mt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { value: 'public' as const, icon: Globe, title: 'Public', desc: 'Anyone can see and join instantly' },
                { value: 'private' as const, icon: Lock, title: 'Private', desc: 'Visible to all · join needs approval' },
              ]).map((opt) => {
                const active = privacy === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPrivacy(opt.value)}
                    className={cn(
                      'relative rounded-xl border p-3.5 text-left transition-all duration-200',
                      active
                        ? 'border-primary bg-primary/[0.04]'
                        : 'border-border/70 bg-card hover:border-border hover:bg-surface/60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                      {active && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold">{opt.title}</p>
                    <p className="text-xs text-muted-foreground font-medium">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => handleClose(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!nameValid || createGroup.isPending || uploading}
              className="rounded-xl font-bold"
            >
              {createGroup.isPending || uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Create Group
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
