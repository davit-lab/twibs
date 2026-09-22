import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Smile, Type, Brush, SlidersHorizontal, Trash2, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FILTERS } from '@/lib/media-filters';
import {
  STORY_TEXT_COLORS,
  STORY_FONTS,
  STORY_EMOJI_PACK,
  makeOverlayId,
  storyMediaFilterStyle,
  type StoryDrawOverlay,
  type StoryFilterOverlay,
  type StoryOverlay,
  type StoryStickerOverlay,
  type StoryTextOverlay,
} from '@/lib/stories';
import StoryOverlayRenderer from './StoryOverlayRenderer';

type Tool = 'none' | 'text' | 'sticker' | 'draw' | 'filter';
type Selected = StoryTextOverlay | StoryStickerOverlay;

const DRAW_COLORS = ['#FFFFFF', '#0B0A10', '#8B5CF6', '#F43F5E', '#38BDF8', '#FBBF24', '#34D399', '#F472B6', '#F97316'];
const DRAW_SIZES = [14, 32, 64];

function useBoxSize(): [React.RefObject<HTMLDivElement>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export interface StoryEditorProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  overlays: StoryOverlay[];
  onChange: (overlays: StoryOverlay[]) => void;
  onClose: () => void;
  onNext: () => void;
}

const TOOLS: { id: Exclude<Tool, 'none'>; label: string; icon: typeof Type }[] = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'sticker', label: 'Sticker', icon: Smile },
  { id: 'draw', label: 'Draw', icon: Brush },
  { id: 'filter', label: 'Filter', icon: SlidersHorizontal },
];

export default function StoryEditor({ mediaUrl, mediaType, overlays, onChange, onClose, onNext }: StoryEditorProps) {
  const [boxRef, box] = useBoxSize();
  const [tool, setTool] = useState<Tool>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stickerEmoji, setStickerEmoji] = useState('😀');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawSize, setDrawSize] = useState(DRAW_SIZES[1]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<{ color: string; size: number; points: [number, number][] } | null>(null);
  const drawingRef = useRef(false);
  const moveQueuedRef = useRef(false);

  const mediaStyle = storyMediaFilterStyle(overlays);
  const filterOverlay = overlays.find((o): o is StoryFilterOverlay => o.type === 'filter');
  const selected = selectedId
    ? (overlays.find((o) => o.id === selectedId) as Selected | undefined) ?? null
    : null;

  useEffect(() => {
    setSelectedId(null);
  }, [tool]);
  useEffect(() => {
    if (!selected) setSelectedId(null);
  }, [selected]);

  // -------------------------------------------------------------------------
  // mutation helpers
  // -------------------------------------------------------------------------

  const patchOverlay = (id: string, patch: Partial<StoryOverlay>) => {
    onChange(overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as StoryOverlay) : o)));
  };

  const removeOverlay = (id: string) => {
    onChange(overlays.filter((o) => o.id !== id));
    setSelectedId(null);
  };

  const addOverlay = (overlay: StoryOverlay) => {
    onChange([...overlays, overlay]);
    setSelectedId(overlay.id);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...selected, id: makeOverlayId(), x: Math.min(0.85, selected.x + 0.06), y: Math.min(0.85, selected.y + 0.06) };
    addOverlay(copy);
  };

  const pointForEvent = (e: React.PointerEvent) => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  // -------------------------------------------------------------------------
  // canvas pointer handling
  // -------------------------------------------------------------------------

  const beginDragSelected = (e: React.PointerEvent, el: Selected) => {
    e.stopPropagation();
    setSelectedId(el.id);
    if (tool === 'draw' || tool === 'filter') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start = pointForEvent(e);
    if (!start) return;
    const offsetX = start.x - el.x;
    const offsetY = start.y - el.y;
    const move = (ev: PointerEvent) => {
      const p = pointForEvent(ev as unknown as React.PointerEvent);
      if (!p) return;
      patchOverlay(el.id, { x: Math.min(1, Math.max(0, p.x - offsetX)), y: Math.min(1, Math.max(0, p.y - offsetY)) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const p = pointForEvent(e);
    if (!p) return;

    if (tool === 'text') {
      addOverlay({
        id: makeOverlayId(),
        type: 'text',
        x: p.x,
        y: p.y,
        text: 'Your text',
        color: STORY_TEXT_COLORS[0],
        background: null,
        fontFamily: 'sans',
        fontSize: 92,
        fontWeight: 'bold',
        fontStyle: 'normal',
        align: 'center',
        maxWidth: 0.82,
      });
      return;
    }

    if (tool === 'sticker') {
      addOverlay({
        id: makeOverlayId(),
        type: 'sticker',
        x: p.x,
        y: p.y,
        emoji: stickerEmoji,
        scale: 1,
      });
      return;
    }

    if (tool === 'draw') {
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      strokeRef.current = { color: drawColor, size: drawSize, points: [[p.x, p.y]] };
      drawingRef.current = true;
      const existing = overlays.find((o): o is StoryDrawOverlay => o.type === 'draw');
      if (existing) {
        patchOverlay(existing.id, { strokes: [...existing.strokes, strokeRef.current] });
      } else {
        addOverlay({ id: makeOverlayId(), type: 'draw', strokes: [strokeRef.current] });
      }
      return;
    }

    setSelectedId(null);
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !strokeRef.current) return;
    const p = pointForEvent(e);
    if (!p) return;
    strokeRef.current.points.push([p.x, p.y]);
    if (moveQueuedRef.current) return;
    moveQueuedRef.current = true;
    requestAnimationFrame(() => {
      moveQueuedRef.current = false;
      const draw = overlays.find((o): o is StoryDrawOverlay => o.type === 'draw');
      const cur = strokeRef.current;
      if (!draw || !cur) return;
      onChange(overlays.map((o) => (o.id === draw.id ? { ...draw, strokes: [...draw.strokes.slice(0, -1), cur] } : o)));
    });
  };

  const endDraw = () => {
    if (drawingRef.current) {
      drawingRef.current = false;
      setSelectedId(null);
    }
  };

  // -------------------------------------------------------------------------
  // filter
  // -------------------------------------------------------------------------

  const applyFilter = (id: string) => {
    setSelectedId(null);
    if (id === 'original' || id === filterOverlay?.preset) {
      onChange(overlays.filter((o) => o.type !== 'filter'));
      return;
    }
    const existing = overlays.find((o): o is StoryFilterOverlay => o.type === 'filter');
    if (existing) {
      patchOverlay(existing.id, { preset: id, intensity: 0.65 });
    } else {
      onChange([...overlays, { id: makeOverlayId(), type: 'filter', preset: id, intensity: 0.65 }]);
    }
  };

  // -------------------------------------------------------------------------
  // layout
  // -------------------------------------------------------------------------

  const stageHeight = box.height ? Math.min(box.width * (16 / 9), box.height) : 0;
  const stageWidth = stageHeight * (9 / 16);

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {/* top bar */}
      <header className="flex items-center justify-between px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-900"
          aria-label="Close editor"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Drafts on
          </span>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Next
        </button>
      </header>

      {/* canvas */}
      <div ref={boxRef} className="relative min-h-0 flex-1 px-2">
        <div className="absolute inset-0 flex items-center justify-center">
          {stageHeight > 0 && (
            <div
              ref={canvasRef}
              className="relative touch-none overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10"
              style={{ width: stageWidth, height: stageHeight }}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
            >
              {mediaType === 'video' ? (
                <video
                  key={mediaUrl}
                  src={mediaUrl}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={mediaStyle}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img src={mediaUrl} alt="Story media" className="absolute inset-0 h-full w-full object-cover" style={mediaStyle} />
              )}

              {/* interactive text / stickers */}
              {overlays
                .filter((o): o is StoryTextOverlay | StoryStickerOverlay => o.type === 'text' || o.type === 'sticker')
                .map((o) => (
                  <div
                    key={o.id}
                    onPointerDown={(e) => beginDragSelected(e, o)}
                    className={cn(
                      'absolute touch-none',
                      selected?.id === o.id
                        ? 'outline outline-2 outline-violet-500'
                        : tool === 'draw' || tool === 'filter'
                          ? 'pointer-events-none'
                          : '',
                    )}
                    style={{
                      left: `${o.x * 100}%`,
                      top: `${o.y * 100}%`,
                      transform: 'translate(-50%,-50%)',
                      maxWidth: '82%',
                      fontSize: o.type === 'text' ? ((o as StoryTextOverlay).fontSize * stageWidth) / 1080 : (96 * (o as StoryStickerOverlay).scale * stageWidth) / 1080,
                      lineHeight: 1.08,
                      fontFamily: o.type === 'text' ? STORY_FONTS.find((f) => f.id === (o as StoryTextOverlay).fontFamily)?.css : undefined,
                      fontWeight: o.type === 'text' ? (o as StoryTextOverlay).fontWeight : undefined,
                      fontStyle: o.type === 'text' ? (o as StoryTextOverlay).fontStyle : undefined,
                      textAlign: o.type === 'text' ? (o as StoryTextOverlay).align : undefined,
                      color: o.type === 'text' ? (o as StoryTextOverlay).color : undefined,
                      letterSpacing: '-0.02em',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                      padding: o.type === 'text' && (o as StoryTextOverlay).background ? '0.25em 0.55em' : undefined,
                      background: o.type === 'text' ? ((o as StoryTextOverlay).background ?? undefined) : undefined,
                      borderRadius: o.type === 'text' && (o as StoryTextOverlay).background ? '999px' : undefined,
                      cursor: tool === 'draw' || tool === 'filter' ? 'default' : 'grab',
                    }}
                  >
                    {o.type === 'text' ? (o as StoryTextOverlay).text : (o as StoryStickerOverlay).emoji}
                  </div>
                ))}

              {/* draw layer renders through the shared renderer (its own draw svg) */}
              <StoryOverlayRenderer overlays={overlays.filter((o) => o.type !== 'text' && o.type !== 'sticker')} className="pointer-events-none absolute inset-0" />
            </div>
          )}
        </div>

        {/* hint */}
        {tool === 'filter' && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/80 backdrop-blur">Pick a filter below</span>
          </div>
        )}
      </div>

      {/* text edit panel for the selected text */}
      {selected && selected.type === 'text' && (
        <TextEditPanel overlay={selected} onPatch={patchOverlay} onDelete={() => removeOverlay(selected.id)} onDuplicate={duplicateSelected} />
      )}

      {/* sticker edit panel */}
      {selected && selected.type === 'sticker' && (
        <StickerEditPanel
          overlay={selected}
          onPatch={patchOverlay}
          onDelete={() => removeOverlay(selected.id)}
          currentEmoji={stickerEmoji}
          onSetEmoji={setStickerEmoji}
        />
      )}

      {/* filter panel */}
      {tool === 'filter' && <FilterPanel filterOverlay={filterOverlay} onApply={applyFilter} onPatch={patchOverlay} />}

      {/* additive panels when active tool but nothing selected yet */}
      {tool === 'text' && !selected && (
        <div className="px-4 py-3 text-center text-xs text-zinc-400">Tap on the photo to add text</div>
      )}
      {tool === 'sticker' && !selected && (
        <div className="px-4 py-3">
          <StickerGrid currentEmoji={stickerEmoji} onPick={(e) => setStickerEmoji(e)} />
        </div>
      )}
      {tool === 'draw' && !selected && (
        <DrawPanel color={drawColor} size={drawSize} onColor={setDrawColor} onSize={setDrawSize} />
      )}

      {/* tool rail */}
      <nav className="border-t border-zinc-900 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)]">
        <div className="flex items-center justify-around">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <ToolButton key={id} active={tool === id} label={label} icon={Icon} onClick={() => setTool(tool === id ? 'none' : id)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub panels
// ---------------------------------------------------------------------------

function ToolButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Type;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] transition',
        active ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-200',
      )}
    >
      <span className={cn('flex h-9 w-14 items-center justify-center rounded-lg', active ? 'bg-violet-500/15' : '')}>
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </button>
  );
}

function TextEditPanel({
  overlay,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  overlay: StoryTextOverlay;
  onPatch: (id: string, patch: Partial<StoryOverlay>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="border-t border-zinc-900 px-3 pb-3 pt-3">
      <textarea
        value={overlay.text}
        onChange={(e) => onPatch(overlay.id, { text: e.target.value })}
        rows={1}
        maxLength={120}
        placeholder="Type something…"
        className="h-10 w-full resize-none bg-transparent text-base font-medium text-white placeholder:text-zinc-600 focus:outline-none"
      />

      <div className="my-2 flex items-center gap-2">
        {STORY_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPatch(overlay.id, { fontFamily: f.id })}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs transition',
              overlay.fontFamily === f.id ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800',
            )}
            style={{ fontFamily: f.css }}
          >
            {f.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPatch(overlay.id, { fontWeight: overlay.fontWeight === 'bold' ? 'regular' : 'bold' })}
            className={cn('h-8 w-8 rounded-lg text-sm font-bold transition', overlay.fontWeight === 'bold' ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300')}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => onPatch(overlay.id, { fontStyle: overlay.fontStyle === 'italic' ? 'normal' : 'italic' })}
            className={cn('h-8 w-8 rounded-lg text-sm italic transition', overlay.fontStyle === 'italic' ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300')}
          >
            I
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {STORY_TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Text color ${c}`}
              onClick={() => onPatch(overlay.id, { color: c })}
              className={cn(
                'h-7 w-7 rounded-full border border-white/20 transition',
                overlay.color === c && 'ring-2 ring-white ring-offset-2 ring-offset-black',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const order: (string | null)[] = [null, '#0B0A10', '#FFFFFF'];
              const cur = order.indexOf(overlay.background);
              onPatch(overlay.id, { background: order[(cur + 1) % order.length] });
            }}
            className={cn('h-8 rounded-lg px-3 text-xs transition', overlay.background ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800')}
          >
            Bg pill
          </button>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onPatch(overlay.id, { align: a })}
              className={cn('h-8 w-8 rounded-lg text-xs capitalize transition', overlay.align === a ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300')}
            >
              {a}
            </button>
          ))}
          <button type="button" onClick={onDuplicate} className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800" aria-label="Duplicate text">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800" aria-label="Delete text">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StickerGrid({ currentEmoji, onPick }: { currentEmoji: string; onPick: (emoji: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {STORY_EMOJI_PACK.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl transition', currentEmoji === emoji ? 'bg-violet-500/20 ring-1 ring-violet-500' : 'hover:bg-zinc-900')}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function StickerEditPanel({
  overlay,
  onPatch,
  onDelete,
  currentEmoji,
  onSetEmoji,
}: {
  overlay: StoryStickerOverlay;
  onPatch: (id: string, patch: Partial<StoryOverlay>) => void;
  onDelete: () => void;
  currentEmoji: string;
  onSetEmoji: (emoji: string) => void;
}) {
  return (
    <div className="border-t border-zinc-900 px-3 pb-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-400">Size</span>
        <input
          type="range"
          min={0.4}
          max={3}
          step={0.1}
          value={overlay.scale}
          onChange={(e) => onPatch(overlay.id, { scale: Number(e.target.value) })}
          className="flex-1 accent-violet-500"
        />
        <button type="button" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 hover:bg-zinc-800" aria-label="Delete sticker">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2">
        <StickerGrid currentEmoji={currentEmoji} onPick={(e) => { onSetEmoji(e); onPatch(overlay.id, { emoji: e }); }} />
      </div>
    </div>
  );
}

function DrawPanel({ color, size, onColor, onSize }: { color: string; size: number; onColor: (c: string) => void; onSize: (s: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-zinc-900 px-4 py-3">
      <div className="flex items-center gap-1.5">
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Draw color ${c}`}
            onClick={() => onColor(c)}
            className={cn('h-8 w-8 rounded-full border border-white/20 transition', color === c && 'ring-2 ring-white ring-offset-2 ring-offset-black')}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {DRAW_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSize(s)}
            className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition', size === s ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-300')}
          >
            <span className="rounded-full bg-current" style={{ width: Math.min(s / 3, 22), height: Math.min(s / 3, 22) }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({
  filterOverlay,
  onApply,
  onPatch,
}: {
  filterOverlay: StoryFilterOverlay | undefined;
  onApply: (id: string) => void;
  onPatch: (id: string, patch: Partial<StoryOverlay>) => void;
}) {
  return (
    <div className="border-t border-zinc-900 px-3 pb-3 pt-3">
      {filterOverlay && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-xs text-zinc-400">Intensity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={filterOverlay.intensity}
            onChange={(e) => onPatch(filterOverlay.id, { intensity: Number(e.target.value) })}
            className="flex-1 accent-violet-500"
          />
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onApply(f.id)}
            className={cn(
              'flex min-w-[70px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition',
              filterOverlay?.preset === f.id ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-400 hover:bg-zinc-900',
            )}
          >
            <span
              className="flex h-12 w-9 items-center justify-center overflow-hidden rounded-lg text-lg"
              style={{ background: `linear-gradient(135deg, ${f.accent}55, ${f.accent})` }}
            >
              ·
            </span>
            <span>{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}