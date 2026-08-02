import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
  position?: 'up' | 'down';
}

interface GifResult {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    original: { url: string };
    fixed_height_small: { url: string };
  };
}

// Using Giphy's public API key for demo purposes
const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
const PAGE_SIZE = 50;

import { cn } from '@/lib/utils';

export default function GifPicker({ onSelect, onClose, position = 'up' }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentQueryRef = useRef('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchPage = useCallback(async (pageOffset: number) => {
    const q = debouncedQuery;
    currentQueryRef.current = q;
    const isNewSearch = pageOffset === 0;
    if (isNewSearch) setLoading(true);
    else setLoadingMore(true);

    try {
      const endpoint = q
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${pageOffset}&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${PAGE_SIZE}&offset=${pageOffset}&rating=g`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (currentQueryRef.current !== q) return;

      const results: GifResult[] = (data.data || []).map((gif: GiphyGif) => ({
        id: gif.id,
        url: gif.images.original.url,
        preview: gif.images.fixed_height_small.url,
        title: gif.title,
      }));

      setHasMore(results.length === PAGE_SIZE);
      setOffset(pageOffset + results.length);
      setGifs(prev => (isNewSearch ? results : [...prev, ...results]));
    } catch (error) {
      console.error('Failed to fetch GIFs:', error);
      if (isNewSearch) setGifs([]);
      setHasMore(false);
    } finally {
      if (isNewSearch) setLoading(false);
      else setLoadingMore(false);
    }
  }, [debouncedQuery]);

  // Fetch GIFs on search change (new page)
  useEffect(() => {
    setGifs([]);
    setHasMore(true);
    fetchPage(0);
  }, [fetchPage]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute right-0 w-96 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl overflow-hidden z-50 shadow-xl shadow-black/5",
        position === 'up' ? "bottom-full mb-2" : "top-full mt-2"
      )}
    >
      {/* Header */}
      <div className="p-3 border-b border-border/30 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search GIFs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-muted/50 border-0 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Trending label */}
      {!searchQuery && (
        <div className="px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground border-b border-border/20">
          <TrendingUp className="h-4 w-4" />
          <span>Trending GIFs</span>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="h-[28rem]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : gifs.length > 0 ? (
          <div>
            <div className="grid grid-cols-3 gap-1 p-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.url)}
                  className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all group"
                >
                  <img
                    src={gif.preview}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="px-2 pb-3">
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => fetchPage(offset)}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loadingMore ? 'Loading...' : 'Load more GIFs'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No GIFs found</p>
          </div>
        )}
      </ScrollArea>

      {/* Giphy attribution */}
      <div className="p-2 border-t border-border/30 flex justify-center">
        <img
          src="https://giphy.com/static/img/giphy-logo-square-180.png"
          alt="Powered by GIPHY"
          className="h-5 opacity-50"
        />
      </div>
    </div>
  );
}
