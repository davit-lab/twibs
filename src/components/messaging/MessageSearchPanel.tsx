import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, ChevronDown, MessageSquare, Mic, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Message } from '@/hooks/useMessages';

interface MessageSearchPanelProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<Message[]>;
  onSelect: (message: Message) => void;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeSnippet = (content: string, query: string): string => {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content;
  const start = Math.max(0, idx - SNIPPET_BEFORE);
  const end = Math.min(content.length, idx + query.length + SNIPPET_AFTER);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
};

const formatResultTime = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchIdRef = useRef(0);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setSearching(false);
      setSelectedIndex(0);
      searchIdRef.current = 0;
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
      const id = ++searchIdRef.current;
      setSearching(true);
      const matches = await onSearch(query);
      if (searchIdRef.current === id) {
        setResults(matches);
        setSelectedIndex(0);
        setSearched(true);
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, onSearch]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      onSelect(results[selectedIndex]);
    }
  };

  const clearQuery = () => {
    searchIdRef.current++;
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  const renderHighlighted = (content: string) => {
    const parts = content.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.trim().toLowerCase() ? (
        <mark key={i} className="rounded-sm bg-primary/25 text-foreground px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const renderResultRow = (m: Message, index: number) => {
    const imageAttachment = m.attachments?.find((a) => a.type === 'image');
    const otherAttachment = m.attachments?.find((a) => a.type !== 'image');
    const senderName = m.profiles?.display_name || m.profiles?.username || 'User';
    const snippet = makeSnippet(m.content, query);

    return (
      <button
        key={m.id}
        ref={index === selectedIndex ? selectedRef : undefined}
        type="button"
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => onSelect(m)}
        className={cn(
          'w-full flex items-start gap-3 px-2 py-2 rounded-xl text-left transition-colors',
          index === selectedIndex ? 'bg-primary/10' : 'hover:bg-muted/50'
        )}
      >
        {imageAttachment ? (
          <img
            src={imageAttachment.url}
            alt=""
            className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-border/50"
          />
        ) : (
          <Avatar className="h-9 w-9 rounded-full flex-shrink-0">
            <AvatarImage src={m.profiles?.avatar_url || undefined} />
            <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
              {(senderName[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold truncate">{senderName}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {formatResultTime(m.created_at)}
            </span>
          </div>

          {snippet && (
            <p className="text-sm leading-snug text-foreground/90 line-clamp-2">
              {renderHighlighted(snippet)}
            </p>
          )}

          {!snippet && otherAttachment && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {otherAttachment.type === 'audio' ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {otherAttachment.type === 'audio'
                ? 'Voice message'
                : `File: ${otherAttachment.name || 'attachment'}`}
            </span>
          )}

          {snippet && otherAttachment && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              {otherAttachment.type === 'audio' ? (
                <Mic className="h-3 w-3" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              {otherAttachment.type === 'audio' ? 'Voice message' : otherAttachment.name}
            </span>
          )}
        </div>
      </button>
    );
  };

  const showSkeletons = searching && results.length === 0;

  return (
    <div className="sticky top-0 z-30 -mx-6 -mt-6 px-6 pt-4 pb-2 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in this chat…"
            className="w-full rounded-full bg-muted/60 border border-transparent focus:border-primary/40 focus:bg-background pl-9 pr-9 py-2 text-sm outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 icon-btn h-6 w-6 rounded-full flex-shrink-0"
              title="Clear"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn h-8 w-8 rounded-full flex-shrink-0"
          title="Close search (Esc)"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between px-1 mt-2">
        <p className="text-[11px] text-muted-foreground">
          {searching
            ? 'Searching…'
            : searched
              ? `${results.length} result${results.length === 1 ? '' : 's'} for “${query.trim()}”`
              : 'Search for messages, photos or files'}
        </p>
        <p className="text-[10px] text-muted-foreground hidden sm:block">↑↓ navigate · Enter jump · Esc close</p>
      </div>

      <div ref={listRef} className="mt-1 max-h-[300px] overflow-y-auto scrollbar-thin pb-1">
        {showSkeletons && (
          <div className="space-y-2 px-2 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!showSkeletons && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-muted/70 flex items-center justify-center mb-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No messages found</p>
            <p className="text-xs text-muted-foreground mt-0.5">Nothing matches “{query.trim()}” in this chat</p>
          </div>
        )}

        {!showSkeletons && !searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-muted/70 flex items-center justify-center mb-2">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Search in this chat</p>
            <p className="text-xs text-muted-foreground mt-0.5">Messages appear here as you type</p>
          </div>
        )}

        {!showSkeletons && results.map(renderResultRow)}
      </div>
    </div>
  );
}
