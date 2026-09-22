import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, Music2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMusicLibrary, type MusicTrack } from '@/hooks/useMusicLibrary';

interface StoryMusicPickerProps {
  value: MusicTrack | null;
  onSelect: (track: MusicTrack | null) => void;
  onClose: () => void;
}

export default function StoryMusicPicker({ value, onSelect, onClose }: StoryMusicPickerProps) {
  const { tracks, loading } = useMusicLibrary();
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(value && value.url ? value.id : null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tracks.filter((t) => t.name.toLowerCase().includes(q)) : tracks;
    // "No Music" stays pinned to the top
    return [...list.filter((t) => t.id === 'none'), ...list.filter((t) => t.id !== 'none')];
  }, [tracks, query]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePreview = (track: MusicTrack) => {
    if (previewId === track.id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    setPreviewId(track.id);
    if (!track.url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = track.url;
    audioRef.current.play().catch(() => {});
  };

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex items-center gap-2 border-b border-zinc-900 px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to editor"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800/60 hover:text-white"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">Add music</h2>
          <p className="text-xs text-zinc-500">Music plays over your story</p>
        </div>
      </header>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs…"
            className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && filtered.length <= 1 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">Loading tracks…</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((track) => {
              const selected = value?.id === track.id;
              const previewing = previewId === track.id;
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(track)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                      selected ? 'bg-violet-500/15' : 'hover:bg-zinc-900',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={previewing ? 'Pause preview' : `Preview ${track.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePreview(track);
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300"
                    >
                      <Music2 className={cn('h-5 w-5', previewing && 'text-violet-400')} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{track.name}</p>
                      <p className="text-xs text-zinc-500">
                        {track.isCustom ? 'Your upload' : 'Music library'}
                      </p>
                    </div>
                    {selected && <Check className="h-5 w-5 shrink-0 text-violet-400" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">No songs match “{query}”.</p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}