import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Book AI — the reading companion, rendered as a Twibsers-native panel.
 *
 * NEVER a ChatGPT clone: this is a *book* panel. It knows which book/book,
 * which chapter, which page, and (when the reader hands it over) the exact
 * selection. The header shows the book; suggested prompts are chapter-aware;
 * every answer cites chapter + page from the actual book text.
 *
 * Design contract (house identity, no AI-slop):
 *   * dark foundation, violet #8B5CF6 as the ONLY accent (no glows, no
 *     gradients, no glass, no rainbow)
 *   * bordered, spare, typographic — reads like part of the Library, not
 *     like a chatbot toy
 *   * desktop = right rail (lg:). mobile = bottom sheet that does not fight
 *     the existing mobile Library/Reader.
 *
 * Provider boundary: this component talks ONLY to `BookAiClient`, which owns
 * the server round-trip (Supabase Edge Function / Vercel-edge per the Phase-4
 * architecture decision). No API key, no model name, no provider string ever
 * exists in this file. Nothing here can leak a secret.
 */

export type BookAiConversation = {
  id: string;
  bookId: string;
  title: string;
  kind: 'book' | 'conversation' | 'reading';
  updatedAt: string;
};

export type BookAiSource = {
  /** Chapter number this fact came from (1-based). */
  chapter: number;
  chapterTitle?: string;
  /** Page in the physical/PDF edition if the source is paginated. */
  page?: number;
  /** Short human label, e.g. "Chapter 7 · p. 84". */
  label: string;
};

export type BookAiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: BookAiSource[];
  streaming?: boolean;
  errorCode?: string;
};

/** What the reader hands the AI so the answer uses REAL book context. */
export type BookAiContext = {
  bookId: string;
  bookTitle: string;
  chapter?: number;
  chapterTitle?: string;
  page?: number;
  selectedText?: string;
};

/** Accents the reader can pick — violet is the house day-one default. */
export type BookAiAccentKey =
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'rose'
  | 'orange'
  | 'neutral';

export type BookAiDensity = 'comfortable' | 'compact';

export type BookAiAppearance = {
  accent: BookAiAccentKey;
  density: BookAiDensity;
  reduceMotion: boolean;
};

export const BOOK_AI_DEFAULT_APPEARANCE: BookAiAppearance = {
  accent: 'violet',
  density: 'comfortable',
  reduceMotion: false,
};

/**
 * Build a set of accent tokens from ONE base color.
 *
 * The rail's design contract is "accent sparing": the reader picks a
 * foundation-accent oncering and the APPEARANCE SYSTEM derives every token it
 * touches from that single pick — no hardcoded 30-color palette, no rainbow,
 * no glow, no gradient. Contrast is clamped so the accent always stays
 * readable on the near-black rail. Neutral keeps a near-slate desaturated
 * tone — the rail NEVER turns into a colored panel.
 */
export type BookAiAccentTokens = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentBorder: string;
  focusRing: string;
  dot: string;
};

const ACCENT_BASES: Record<BookAiAccentKey, { h: number; s: number; l: number }> = {
  violet: { h: 262, s: 62, l: 53 },
  blue: { h: 223, s: 65, l: 53 },
  cyan: { h: 188, s: 75, l: 44 },
  green: { h: 152, s: 58, l: 42 },
  amber: { h: 39, s: 92, l: 50 },
  rose: { h: 350, s: 72, l: 55 },
  orange: { h: 24, s: 90, l: 50 },
  neutral: { h: 220, s: 6, l: 70 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildBookAiTokens(key: BookAiAccentKey): BookAiAccentTokens {
  const b = ACCENT_BASES[key];
  const l = clamp(b.l, 40, 62);
  const h = b.h;
  const s = key === 'neutral' ? b.s : clamp(b.s, 40, 80);
  return {
    accent: `hsl(${h} ${s}% ${l}%)`,
    accentHover: `hsl(${h} ${s}% ${Math.min(70, l + 6)}%)`,
    accentSoft: `hsla(${h} ${s}% ${l}% / 0.12)`,
    accentBorder: `hsla(${h} ${s}% ${l}% / 0.32)`,
    focusRing: `hsla(${h} ${s}% ${l}% / 0.4)`,
    dot: `hsl(${h} ${s}% ${Math.max(66, l + 14)}%)`,
  };
}

/**
 * Persist the appearance locally (per reader). The backend / multi-device
 * sync arrives with Phase-4; this stays in localStorage so the preference is
 * real but never pretends to be server-synced.
 */
const APPEARANCE_KEY = 'twibs:bookai:appearance';

function loadAppearance(): BookAiAppearance {
  if (typeof window === 'undefined') return BOOK_AI_DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return BOOK_AI_DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<BookAiAppearance>;
    return {
      accent: parsed.accent ?? BOOK_AI_DEFAULT_APPEARANCE.accent,
      density: parsed.density ?? BOOK_AI_DEFAULT_APPEARANCE.density,
      reduceMotion: parsed.reduceMotion ?? BOOK_AI_DEFAULT_APPEARANCE.reduceMotion,
    };
  } catch {
    return BOOK_AI_DEFAULT_APPEARANCE;
  }
}

function saveAppearance(a: BookAiAppearance) {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    // private mode / storage blocked — the pick just won't persist. fine.
  }
}

const ACCENT_OPTIONS: { key: BookAiAccentKey; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet', swatch: '#8B5CF6' },
  { key: 'blue', label: 'Blue', swatch: '#3B82F6' },
  { key: 'cyan', label: 'Cyan', swatch: '#22D3EE' },
  { key: 'green', label: 'Green', swatch: '#34D399' },
  { key: 'amber', label: 'Amber', swatch: '#F59E0B' },
  { key: 'rose', label: 'Rose', swatch: '#FB7185' },
  { key: 'orange', label: 'Orange', swatch: '#F97316' },
  { key: 'neutral', label: 'Neutral', swatch: '#9BA1AC' },
];

const DEFAULT_PROMPTS: Record<'chapter' | 'page' | 'book', string[]> = {
  chapter: [
    'Explain this chapter',
    'Summarize this section',
    'Who appears in this chapter?',
  ],
  page: [
    'Summarize this passage',
    'Explain the main idea here',
    'What are the key points?',
  ],
  book: [
    'What is this book about?',
    'Who are the main characters?',
    'Summarize the main ideas',
  ],
};

export type BookAiPromptChipsProps = { items: string[]; onPick: (t: string) => void };

export function BookAiPromptChips({ items, onPick }: BookAiPromptChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-1">
      {items.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function BookAiBubble({ message }: { message: BookAiMessage }) {
  return (
    <div
      className={cn(
        'max-w-[92%] whitespace-pre-wrap rounded-md border px-3 py-2 text-sm leading-relaxed',
        message.role === 'assistant'
          ? 'border-border/70 bg-background text-foreground'
          : 'border-primary/20 bg-primary/5 text-foreground',
      )}
    >
      {message.content || (message.streaming ? '…' : null)}
      {message.sources && message.sources.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border/50 pt-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sources:</span>
          {message.sources.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled
              title={s.chapterTitle}
              className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {message.errorCode ? (
        <p className="mt-1.5 text-[11px] text-red-400">
          {message.errorCode === 'rate_limited'
            ? 'You have reached the rate limit — try again in a little while.'
            : message.errorCode === 'not_in_book'
              ? 'This answer could not be found in the book, so it is based on general knowledge.'
              : 'Something went wrong. Please try again.'}
        </p>
      ) : null}
    </div>
  );
}

export function BookAiHeader({ context }: { context: BookAiContext }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4">
      <p className="min-w-0 text-sm font-semibold leading-tight">Ask about this book</p>
      {context.bookTitle && (
        <span className="max-w-[55%] truncate text-xs text-muted-foreground">
          {context.chapterTitle ??
            (typeof context.chapter === 'number'
              ? `${context.bookTitle} · Chapter ${context.chapter}`
              : context.bookTitle)}
        </span>
      )}
    </div>
  );
}

export function BookAiComposer({ onSend }: { onSend: (t: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-1 flex items-end gap-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const v = value.trim();
            if (v) {
              onSend(v);
              setValue('');
            }
          }
        }}
        rows={1}
        placeholder="Ask something..."
        className="min-h-[36px] w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          const v = value.trim();
          if (v) {
            onSend(v);
            setValue('');
          }
        }}
        className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Send
      </button>
    </div>
  );
}

export function BookAiConversationHeader({
  context,
  onNewConversation,
}: {
  context: BookAiContext;
  onNewConversation?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {onNewConversation ? 'Conversation' : 'Ask about this book'}
        </span>
        {context.bookTitle ? (
          <span className="truncate text-[11px] text-muted-foreground">{context.bookTitle}</span>
        ) : null}
      </div>
      {context.chapter ? (
        <p className="px-4 pt-0.5 text-[11px] text-muted-foreground">
          {context.chapterTitle ?? `Chapter ${context.chapter}`}
          {typeof context.page === 'number' ? ` · p. ${context.page}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function BookAiUsage({
  appearance,
}: {
  appearance: BookAiAppearance;
}) {
  const tokens = buildBookAiTokens(appearance.accent);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Usage</span>
      <span className="text-[10px]" style={{ color: tokens.accentHover }}>
        Available after activation
      </span>
    </div>
  );
}

export function BookAiAppearanceControl({
  appearance,
  onChange,
}: {
  appearance: BookAiAppearance;
  onChange: (a: BookAiAppearance) => void;
}) {
  const [open, setOpen] = useState(false);
  const tokens = buildBookAiTokens(appearance.accent);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Book AI appearance"
        title="Appearance"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
          open && 'border-violet-500/40 bg-violet-500/10 text-violet-400',
        )}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M2.5 13.5h11M2.5 10.5h11M2.5 7.5h11M2.5 4.5h2.25M6.25 4.5h7.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-border/80 bg-background p-3 shadow-xl"
          role="dialog"
          aria-label="Book AI appearance"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Accent
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ACCENT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                title={o.label}
                onClick={() => onChange({ ...appearance, accent: o.key })}
                aria-pressed={appearance.accent === o.key}
                className={cn(
                  'flex h-7 w-full items-center justify-center rounded-md border',
                  appearance.accent === o.key
                    ? 'border-transparent ring-2 ring-offset-1 ring-offset-background'
                    : 'border-border/70 hover:border-border',
                )}
                style={{
                  backgroundColor: o.swatch,
                  ['--tw-ring-color' as string]: o.swatch,
                }}
              />
            ))}
          </div>
          <div className="my-2.5 h-px w-full bg-border/70" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Density</span>
            <select
              value={appearance.density}
              onChange={(e) =>
                onChange({ ...appearance, density: e.target.value as BookAiDensity })
              }
              className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <label className="mt-2 flex cursor-pointer items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Reduce motion</span>
            <input
              type="checkbox"
              checked={appearance.reduceMotion}
              onChange={(e) => onChange({ ...appearance, reduceMotion: e.target.checked })}
              className="accent-current"
              style={{ accentColor: tokens.accent }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function BookAI({
  context,
  className,
}: {
  context: BookAiContext;
  className?: string;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<BookAiMessage[]>([]);
  const [sourceIndex, setSourceIndex] = useState<Map<string, BookAiSource>>(new Map());
  const [busy, setBusy] = useState(false);
  const active = useRef<{ token: number } | null>(null);

  const promptSet = context.chapter
    ? 'chapter'
    : context.selectedText || typeof context.page === 'number'
      ? 'page'
      : 'book';
  const prompts = DEFAULT_PROMPTS[promptSet];

  const sendPrompt = (t: string) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, role: 'user', content: t }]);
  };

  return (
    <section
      aria-label="Ask about this book"
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background',
        className,
      )}
    >
      <BookAiHeader context={context} />
      {context.selectedText ? (
        <div className="border-b border-border/50 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Selected passage
          </span>
          <p className="mt-1 line-clamp-3 text-[12px] italic leading-snug text-foreground/80">
            {context.selectedText}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            {['Explain', 'Summarize'].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => sendPrompt(`${action} this passage`)}
                className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {action}
              </button>
            ))}
            <button
              type="button"
              className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-1 px-2">
            <p className="text-[13px] text-muted-foreground">
              Ask questions about this book. Answers are based on the text.
            </p>
          </div>
        ) : (
          messages.map((m) => <BookAiBubble key={m.id} message={m} />)
        )}
      </div>

      <BookAiPromptChips items={prompts} onPick={sendPrompt} />
      <div className="border-t border-border/60 p-2">
        <BookAiComposer onSend={sendPrompt} />
      </div>
    </section>
  );
}

/**
 * Client boundary — Book AI traffic goes to ONE place: a server-side provider,
 * owning the Phase-4 decision (Supabase Edge Function / Vercel-edge). No key,
 * no model, no provider string exists in the browser. These throw on purpose;
 * the real endpoint plugs into THIS seam during Phase 4.
 */
export const BookAiClient = {
  createConversation: async (_bookId: string, _user: unknown): Promise<string> => {
    throw new Error(
      'BookAiClient.createConversation: Phase 4 provider endpoint not deployed yet. ' +
        'Create the real server seam (Edge Function on book/ai/conversations). ' +
        'No key can exist in the browser.',
    );
  },
  ask: async (input: {
    bookId: string;
    bookTitle: string;
    chapter?: number;
    page?: number;
    chapterTitle?: string;
    selectedText?: string;
    prompt: string;
    conversationId?: string;
  }): Promise<{ text: string; sources?: BookAiSource[] }> => {
    void input;
    throw new Error(
      'BookAiClient.ask: Phase 4 provider endpoint not deployed yet — no key can exist client-side.',
    );
  },
};
