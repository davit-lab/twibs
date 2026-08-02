import { useState, useRef, useEffect } from 'react';
import { Search, Play, Pause, Loader2, Check } from 'lucide-react';
import { useMusicLibrary, MusicTrack } from '@/hooks/useMusicLibrary';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface MusicPickerProps {
  value: string;
  onSelect: (track: MusicTrack) => void;
}

export default function MusicPicker({ value, onSelect }: MusicPickerProps) {
  const { tracks, loading } = useMusicLibrary();
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const filtered = tracks
    .filter((t) => t.id !== 'none')
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  const togglePreview = (track: MusicTrack) => {
    if (!track.url) return;
    if (previewId === track.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    setPreviewId(track.id);
    if (audioRef.current) {
      audioRef.current.src = track.url;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSelect = (track: MusicTrack) => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setPreviewId(null);
    onSelect(track);
  };

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search music..."
          className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/50 border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <ScrollArea className="max-h-52 pr-1">
        <div className="space-y-1">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading music...
            </div>
          )}
          {filtered.map((track) => (
            <div
              key={track.id}
              className={cn(
                'flex items-center gap-2.5 p-2 rounded-xl transition-all cursor-pointer',
                value === track.id ? 'bg-primary/10' : 'hover:bg-muted/80'
              )}
              onClick={() => handleSelect(track)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePreview(track);
                }}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                  previewId === track.id && isPlaying
                    ? 'bg-primary text-white'
                    : 'bg-primary/10 hover:bg-primary/20 text-primary'
                )}
              >
                {previewId === track.id && isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <span className="flex-1 text-sm font-medium truncate">{track.name}</span>
              {value === track.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground p-3">No music found.</div>
          )}
        </div>
      </ScrollArea>

      <audio ref={audioRef} className="hidden" onEnded={() => setIsPlaying(false)} />
    </div>
  );
}
