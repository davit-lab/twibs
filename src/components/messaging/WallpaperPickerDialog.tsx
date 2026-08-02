import { useRef, useState } from 'react';
import { Check, Loader2, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  BUILT_IN_WALLPAPERS,
  NONE_WALLPAPER_ID,
  isCustomWallpaper,
  wallpaperName,
} from '@/lib/chatWallpapers';
import { cn } from '@/lib/utils';

interface WallpaperPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  onSelect: (value: string) => void;
}

export default function WallpaperPickerDialog({ open, onOpenChange, value, onSelect }: WallpaperPickerDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an image file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB.' });
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/wallpapers/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      onSelect(urlData.publicUrl);
      toast({ title: 'Wallpaper added', description: 'Your custom wallpaper is now active.' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to upload wallpaper.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlApply = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      toast({ variant: 'destructive', title: 'Invalid URL', description: 'Enter a full image URL starting with http(s)://' });
      return;
    }
    onSelect(trimmed);
    setUrl('');
    toast({ title: 'Wallpaper added', description: 'Your custom wallpaper is now active.' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className="inline-block h-5 w-5 rounded-md border border-border/60"
              style={{
                background: getWallpaperPreview(value),
              }}
            />
            Chat wallpaper
            <span className="text-sm font-normal text-muted-foreground">
              {value ? wallpaperName(value) : 'Default'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Built-in */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Free wallpapers
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              <WallpaperTile
                label="Default"
                background="hsl(var(--background))"
                active={!value || value === NONE_WALLPAPER_ID}
                onClick={() => onSelect(NONE_WALLPAPER_ID)}
              />
              {BUILT_IN_WALLPAPERS.map((w) => (
                <WallpaperTile
                  key={w.id}
                  label={w.name}
                  background={w.background}
                  active={value === w.id}
                  onClick={() => onSelect(w.id)}
                />
              ))}
            </div>
          </div>

          {/* Custom */}
          <div className="border-t border-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Your own wallpaper
            </p>
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Upload an image'}
              </Button>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="…or paste an image URL"
                    className="pr-8"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUrlApply();
                    }}
                  />
                  {url && (
                    <button
                      onClick={() => setUrl('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button onClick={handleUrlApply} disabled={!url.trim()}>
                  Apply
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your wallpaper is saved to your account and applies to every chat.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getWallpaperPreview(value: string | null): string {
  if (!value || value === NONE_WALLPAPER_ID) return 'hsl(var(--background))';
  const builtIn = BUILT_IN_WALLPAPERS.find((w) => w.id === value);
  if (builtIn) return builtIn.background;
  if (isCustomWallpaper(value)) return `url("${value}") center / cover`;
  return 'hsl(var(--background))';
}

function WallpaperTile({
  label,
  background,
  active,
  onClick,
}: {
  label: string;
  background: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all',
        active ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-primary/50'
      )}
      title={label}
    >
      <div className="absolute inset-0" style={{ background }} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5">
        <p className="text-[11px] font-bold text-white text-left truncate">{label}</p>
      </div>
      {active && (
        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
    </button>
  );
}
