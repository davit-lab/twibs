import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCustomBackgrounds } from '@/hooks/useCustomBackgrounds';
import {
  BUILT_IN_WALLPAPERS,
  WALLPAPER_CATEGORIES,
  NONE_WALLPAPER_ID,
  wallpaperThumbUrl,
  wallpaperThumbForValue,
  wallpaperName,
  type WallpaperCategory,
  type CustomBackground,
} from '@/lib/chatWallpapers';
import { cn } from '@/lib/utils';

type CategoryFilter = 'All' | WallpaperCategory;

interface WallpaperPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  onSelect: (value: string) => void;
  note?: string;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp';

export default function WallpaperPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
  note,
}: WallpaperPickerDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { items, loading, uploading, upload, remove, refresh } = useCustomBackgrounds();

  const [category, setCategory] = useState<CategoryFilter>('All');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep the list fresh each time the dialog opens.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Clean up object URLs for the pre-upload preview.
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const close = () => {
    setPendingFile(null);
    setPendingPreview(null);
    onOpenChange(false);
  };

  const handleFileChosen = (file: File | null | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ variant: 'destructive', title: 'Unsupported format', description: 'Please choose a JPG, PNG or WebP image.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'The maximum size is 8 MB.' });
      return;
    }
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPendingFile(file);
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    try {
      const url = await upload(pendingFile);
      if (!url) throw new Error('Upload failed. Please try again.');
      setPendingFile(null);
      setPendingPreview(null);
      onSelect(url);
      toast({ title: 'Background applied', description: 'Your custom background is now active in this chat.' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload this image.',
      });
    }
  };

  const handleDelete = async (item: CustomBackground) => {
    const name = wallpaperName(item.url);
    try {
      const ok = await remove(item);
      if (ok) {
        toast({ title: 'Background removed', description: `“${name === 'Custom' ? 'Your background' : name}” was deleted.` });
      } else {
        toast({ variant: 'destructive', title: 'Could not delete', description: 'Please try again.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Could not delete', description: 'Please try again.' });
    }
  };

  const filtered =
    category === 'All'
      ? BUILT_IN_WALLPAPERS
      : BUILT_IN_WALLPAPERS.filter((w) => w.category === category);

  const currentThumb = wallpaperThumbForValue(value);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Live preview of the chat surface */}
        <div className="border-b border-border px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 overflow-hidden bg-muted">
                {currentThumb ? (
                  <img src={currentThumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="h-full w-full" style={{ backgroundColor: 'hsl(var(--background))' }} />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight">Chat background</h2>
                <p className="text-xs text-muted-foreground truncate">{wallpaperName(value)}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => onSelect(NONE_WALLPAPER_ID)}>
              Reset to default
            </Button>
          </div>

          <div aria-hidden className="relative h-36 sm:h-44 rounded-xl overflow-hidden border border-border/50">
            {value && (
              <img
                src={wallpaperThumbForValue(value) || wallpaperThumbUrl(currentSourceBase(value))}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35" />
            <div className="absolute inset-0 flex flex-col justify-end gap-1.5 p-3">
              <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-primary/90 px-3 py-1.5 text-[10px] text-primary-foreground shadow-sm">
                Hey — the new background looks great.
              </div>
              <div className="max-w-[70%] rounded-2xl rounded-tl-sm bg-card/90 px-3 py-1.5 text-[10px] text-foreground shadow-sm backdrop-blur-sm">
                It does. Sending you the details now.
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-6">
          {/* Library */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold">Curated library</h3>
              <span className="text-[11px] text-muted-foreground">{filtered.length} backgrounds</span>
            </div>

            {/* Subtle category filter */}
            <div
              role="tablist"
              aria-label="Background categories"
              className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin"
            >
              {(['All', ...WALLPAPER_CATEGORIES] as CategoryFilter[]).map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors',
                    category === c
                      ? 'bg-foreground/[0.06] text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {filtered.map((w) => {
                const active = value === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    aria-pressed={active}
                    aria-label={`Set background to ${w.name}`}
                    title={w.name}
                    className={cn(
                      'group relative aspect-[4/5] overflow-hidden rounded-lg focus-visible:outline-none',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active ? 'ring-1 ring-foreground/80' : 'ring-1 ring-transparent hover:ring-foreground/30'
                    )}
                    style={{ backgroundColor: w.tint }}
                  >
                    <img
                      src={wallpaperThumbUrl(w.url, 400, 500)}
                      alt={w.name}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {active && (
                      <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p aria-hidden className="mt-2 text-[11px] text-muted-foreground">
              {filtered[0]?.description ?? ''}
            </p>
          </section>

          {/* Custom backgrounds */}
          <section className="border-t border-border pt-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold">Custom backgrounds</h3>
              <span className="text-[11px] text-muted-foreground">Yours, only visible to you</span>
            </div>

            {pendingFile ? (
              <div className="rounded-xl border border-border/70 overflow-hidden">
                <div className="relative aspect-[16/7] bg-muted">
                  <img src={pendingPreview || undefined} alt="Preview" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-[11px] text-white/90">
                    Ready to add — preview before you apply
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <Button type="button" variant="ghost" size="sm" className="text-xs rounded-full" onClick={() => {
                    setPendingFile(null);
                    setPendingPreview(null);
                  }}>
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="text-xs rounded-full" onClick={() => fileInputRef.current?.click()}>
                      Replace
                    </Button>
                    <Button type="button" size="sm" className="text-xs rounded-full" onClick={confirmUpload} disabled={uploading}>
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {uploading ? 'Uploading…' : 'Use this background'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropping(false);
                  handleFileChosen(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors',
                  dropping ? 'border-primary bg-primary/[0.06]' : 'border-border/70 hover:border-foreground/30'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => {
                    handleFileChosen(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors',
                    dropping ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground'
                  )}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  {uploading ? (
                    <>
                      <p className="text-sm font-medium">Uploading…</p>
                      <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-left text-sm font-medium hover:underline underline-offset-4"
                      >
                        Upload your own photo
                      </button>
                      <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · up to 8 MB · drag &amp; drop works too</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {items.map((item) => {
                  const active = value === item.url;
                  return (
                    <div key={item.id} className="group relative aspect-[4/5]">
                      <button
                        onClick={() => onSelect(item.url)}
                        aria-pressed={active}
                        aria-label="Use this custom background"
                        title="Use this background"
                        className={cn(
                          'h-full w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          active ? 'ring-1 ring-foreground/80' : 'ring-1 ring-transparent hover:ring-foreground/30'
                        )}
                      >
                        <img
                          src={item.thumb_path ? supabase.storage.from('wallpapers').getPublicUrl(item.thumb_path).data.publicUrl : item.url}
                          alt="Your custom background"
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {active && (
                          <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => void handleDelete(item)}
                        aria-label="Delete this custom background"
                        title="Delete background"
                        className={cn(
                          'absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full opacity-100',
                          'bg-black/55 text-white transition-opacity focus-visible:opacity-100',
                          'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100',
                          'hover:bg-destructive'
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 px-6 py-8 text-center">
                <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium">No custom backgrounds yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {user ? 'Upload a photo to build your personal collection.' : 'Sign in to upload your own backgrounds.'}
                </p>
                {user && (
                  <Button type="button" variant="ghost" size="sm" className="mt-3 text-xs rounded-full" onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-3.5 w-3.5" /> Upload
                  </Button>
                )}
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              {note || 'This background is shared with everyone in the chat — any member can change it.'}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function currentSourceBase(value: string | null | undefined): string {
  if (!value) return '';
  const builtIn = BUILT_IN_WALLPAPERS.find((w) => w.id === value);
  return builtIn ? builtIn.url : '';
}