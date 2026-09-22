import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  STORY_DESIGN_WIDTH,
  STORY_FONTS,
  type StoryDrawOverlay,
  type StoryOverlay,
  type StoryTextOverlay,
} from '@/lib/stories';

/**
 * Renders a story's creative overlays (text, stickers, drawings) on top of
 * media. Everything is normalized to the 1080px-wide design grid and scaled to
 * the actual container, so what a creator previews is exactly what a viewer
 * sees. CSS filters are applied to the media element itself (never to these
 * layers) and backgrounds are rendered behind the media by the parent.
 */

function fontCss(family: StoryTextOverlay['fontFamily']): string {
  return STORY_FONTS.find((f) => f.id === family)?.css || STORY_FONTS[0].css;
}

const FALLBACK = 375;

export function useStoryScale(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(FALLBACK / STORY_DESIGN_WIDTH);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setScale((rect.width || FALLBACK) / STORY_DESIGN_WIDTH);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, scale];
}

export function StoryDrawLayer({
  overlay,
  scale,
  className,
}: {
  overlay: StoryDrawOverlay;
  scale: number;
  className?: string;
}) {
  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {overlay.strokes.map((stroke, i) => (
        <polyline
          key={`${stroke.color}-${stroke.size}-${i}`}
          fill="none"
          stroke={stroke.color}
          strokeWidth={Math.max(3, stroke.size * scale)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.92}
          points={stroke.points.map((p) => `${p[0] * 100},${p[1] * 100}`).join(' ')}
        />
      ))}
    </svg>
  );
}

export interface StoryOverlayRendererProps {
  overlays: StoryOverlay[];
  className?: string;
  textClassName?: string;
}

export default function StoryOverlayRenderer({ overlays, className, textClassName }: StoryOverlayRendererProps) {
  const [ref, scale] = useStoryScale();

  const texts = overlays.filter(
    (o): o is Extract<StoryOverlay, { type: 'text' }> => o.type === 'text' && o.text.trim().length > 0,
  );
  const stickers = overlays.filter((o): o is Extract<StoryOverlay, { type: 'sticker' }> => o.type === 'sticker');
  const draw = overlays.find((o): o is StoryDrawOverlay => o.type === 'draw');

  return (
    <div ref={ref} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {draw && draw.strokes.length > 0 && <StoryDrawLayer overlay={draw} scale={scale} />}

      {texts.map((t) => (
        <div
          key={t.id}
          className={textClassName}
          style={{
            position: 'absolute',
            left: `${t.x * 100}%`,
            top: `${t.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            maxWidth: `${Math.max(0.25, t.maxWidth) * 100}%`,
            textAlign: t.align,
            fontSize: t.fontSize * scale,
            lineHeight: 1.08,
            fontFamily: fontCss(t.fontFamily),
            fontWeight: t.fontWeight,
            fontStyle: t.fontStyle,
            color: t.color,
            letterSpacing: '-0.02em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textShadow: '0 2px 10px rgba(0,0,0,0.45)',
            padding: t.background ? '0.3em 0.6em' : undefined,
            background: t.background ?? undefined,
            borderRadius: t.background ? '999px' : undefined,
          }}
        >
          {t.text}
        </div>
      ))}

      {stickers.map((s) => (
        <div
          key={s.id}
          style={{
            position: 'absolute',
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: 96 * s.scale * scale,
            lineHeight: 1,
          }}
        >
          {s.emoji}
        </div>
      ))}
    </div>
  );
}