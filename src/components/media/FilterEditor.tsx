import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  FILTERS,
  FilterPreset,
  bakeImageWithFilter,
  bakeVideoWithFilter,
  getFilter,
  videoFrameToDataURL,
} from '@/lib/media-filters';
import { useMusicLibrary, MusicTrack } from '@/hooks/useMusicLibrary';
import { cn } from '@/lib/utils';
import { ChevronLeft, X, Check, Music, Loader2, Wand2 } from 'lucide-react';

export interface MediaEditorMedia {
  file: File;
  url: string;
  type: 'image' | 'video';
}

export interface MediaEditorResult {
  file: File;
  kind: 'image' | 'video';
  filter: FilterPreset;
  intensity: number;
  duration?: number;
  caption?: string;
  music?: { name: string; url: string | null };
}

interface FilterEditorProps {
  media: MediaEditorMedia;
  mode: 'story' | 'post';
  initialFilter?: FilterPreset;
  initialIntensity?: number;
  onBack?: () => void;
  onClose: () => void;
  onDone: (result: MediaEditorResult) => void;
}

function FilteredMedia({ media, filter, intensity }: { media: MediaEditorMedia; filter: FilterPreset; intensity: number }) {
  const baseClass = 'absolute inset-0 w-full h-full object-contain';
  return (
    <div className="relative w-full h-full">
      {media.type === 'image' ? (
        <img src={media.url} alt="" className={baseClass} draggable={false} />
      ) : (
        <video src={media.url} muted loop playsInline autoPlay className={baseClass} />
      )}
      {filter.id !== 'original' && filter.css && (
        <>
          {media.type === 'image' ? (
            <img src={media.url} alt="" className={baseClass} style={{ filter: filter.css, opacity: intensity }} draggable={false} />
          ) : (
            <video src={media.url} muted loop playsInline autoPlay className={baseClass} style={{ filter: filter.css, opacity: intensity }} />
          )}
        </>
      )}
    </div>
  );
}

export default function FilterEditor({ media, mode, initialFilter, initialIntensity = 1, onBack, onClose, onDone }: FilterEditorProps) {
  const [selectedId, setSelectedId] = useState(initialFilter?.id || 'original');
  const [intensity, setIntensity] = useState(initialIntensity);
  const [caption, setCaption] = useState('');
  const [music, setMusic] = useState<MusicTrack>({ id: 'none', name: 'No Music', url: null, duration: 0 });
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [posterFrame, setPosterFrame] = useState<string | null>(null);
  const { tracks } = useMusicLibrary();
  const cancelRef = useRef(false);

  const selected = useMemo(() => getFilter(selectedId), [selectedId]);

  useEffect(() => {
    if (media.type !== 'video') return;
    let active = true;
    videoFrameToDataURL(media.file, 0.3).then((frame) => {
      if (active && frame) setPosterFrame(frame);
    });
    return () => {
      active = false;
    };
  }, [media]);

  const handleDone = async () => {
    if (applying) return;
    setApplying(true);
    setProgress(0);
    cancelRef.current = false;
    try {
      let outFile = media.file;
      if (media.type === 'image') {
        if (selected.id !== 'original') {
          const baked = await bakeImageWithFilter(media.file, selected, intensity);
          if (baked) outFile = baked;
        }
      } else if (selected.id !== 'original') {
        const baked = await bakeVideoWithFilter(media.file, selected, intensity, (p) => {
          if (!cancelRef.current) setProgress(p.fraction);
        });
        if (baked) outFile = baked;
      }
      onDone({
        file: outFile,
        kind: media.type,
        filter: selected,
        intensity,
        caption: mode === 'story' && caption.trim() ? caption.trim() : undefined,
        music: mode === 'story' && music.url ? { name: music.name, url: music.url } : undefined,
      });
    } finally {
      setApplying(false);
    }
  };

  const chipThumb = (f: FilterPreset) => {
    if (media.type === 'image') return media.url;
    return posterFrame || media.url;
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-[#0d0c12] text-white">
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} disabled={applying} className="h-9 w-9 rounded-full text-white hover:bg-white/10">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <span className="font-semibold text-sm">
            {mode === 'story' ? 'New Story' : media.type === 'video' ? 'Edit Video' : 'Edit Photo'}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={applying} className="h-9 w-9 rounded-full text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Preview */}
      <div className="relative flex-1 min-h-0 px-2">
        <div className="relative w-full h-full overflow-hidden rounded-3xl ring-1 ring-white/10 bg-black">
          <FilteredMedia media={media} filter={selected} intensity={intensity} />

          {applying && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Applying {selected.name} filter…</p>
              <div className="w-48 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Intensity */}
      {selected.id !== 'original' && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3">
            <Wand2 className="h-4 w-4 text-primary/80 flex-shrink-0" />
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Filter intensity"
            />
            <span className="text-xs text-white/60 tabular-nums w-8 text-right">{Math.round(intensity * 100)}%</span>
          </div>
        </div>
      )}

      {/* Filter strip */}
      <div className="pt-3">
        <ScrollArea className="w-full">
          <div className="flex gap-2.5 px-4 pb-1">
            {FILTERS.map((f) => {
              const active = f.id === selected.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="flex flex-col items-center gap-1.5 min-w-[64px] group"
                >
                  <div
                    className={cn(
                      'w-[64px] h-[86px] rounded-xl overflow-hidden ring-2 ring-offset-2 ring-offset-[#0d0c12] transition-all duration-150',
                      active ? 'ring-primary scale-105' : 'ring-transparent group-hover:ring-white/30'
                    )}
                  >
                    {media.type === 'image' ? (
                      <img
                        src={chipThumb(f)}
                        alt={f.name}
                        className="w-full h-full object-cover"
                        style={{ filter: f.css }}
                        draggable={false}
                      />
                    ) : (
                      <div className="relative w-full h-full">
                        <img
                          src={posterFrame || media.url}
                          alt={f.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{ filter: f.css }}
                          draggable={false}
                        />
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium transition-colors',
                      active ? 'text-primary' : 'text-white/60 group-hover:text-white'
                    )}
                  >
                    {f.name}
                  </span>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="opacity-0" />
        </ScrollArea>
      </div>

      {/* Story caption + music */}
      {mode === 'story' && (
        <div className="px-4 pt-3 space-y-3 pb-2">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption…"
            maxLength={220}
            className="min-h-[38px] max-h-20 resize-none bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-primary/50"
          />
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-1">
              {tracks.map((t) => {
                const active = t.id === music.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setMusic(t)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                      active ? 'bg-primary text-white' : 'bg-white/10 text-white/70 hover:bg-white/15'
                    )}
                  >
                    <Music className="h-3.5 w-3.5" />
                    {t.name}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" className="opacity-0" />
          </ScrollArea>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3">
        <Button
          onClick={handleDone}
          disabled={applying}
          className="w-full h-12 rounded-2xl text-base font-semibold bg-primary hover:bg-primary/90 text-white"
        >
          {applying ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              <Check className="h-5 w-5" />
              {mode === 'story' ? 'Share Story' : 'Add to Post'}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
