import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/hooks/useMessages';

interface MessageSearchPanelProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<Message[]>;
  onSelect: (message: Message) => void;
}

export default function MessageSearchPanel({
  open,
  onClose,
  onSearch,
  onSelect,
}: MessageSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const matches = await onSearch(query);
      setResults(matches);
      setSearched(true);
      setSearching(false);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, onSearch]);

  if (!open) return null;

  const preview = (m: Message) => {
    if (m.attachments?.some(a => a.type === 'image')) return '📷 Photo';
    if (m.attachments?.some(a => a.type === 'audio')) return '🎤 Voice message';
    if (m.attachments?.some(a => a.type === 'file')) return '📎 File';
    return m.content;
  };

  return (
    <div className="absolute left-0 right-0 top-[70px] z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-lg">
      <div className="flex items-center gap-2 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in this chat…"
          className="flex-1 bg-transparent border-0 outline-none text-sm"
        />
        {searching ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
        ) : (
          <button type="button" onClick={onClose} className="icon-btn h-7 w-7 rounded-full flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto scrollbar-thin pb-2">
        {searched && results.length === 0 && !searching && (
          <p className="text-sm text-muted-foreground text-center py-6">No messages found</p>
        )}
        {results.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors text-left"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                {m.sender_id ? (m.profiles?.display_name || 'User') : 'User'} ·{' '}
                {new Date(m.created_at).toLocaleString()}
              </p>
              <p className="text-sm truncate">
                {preview(m).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                  part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="bg-primary/20 text-foreground rounded-sm">{part}</mark>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
