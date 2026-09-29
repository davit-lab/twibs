interface StoryMediaBackdropProps {
  src: string;
  mediaType: 'image' | 'video';
  style?: React.CSSProperties;
}

/** A quiet, media-derived fill behind fitted landscape story photos. */
export default function StoryMediaBackdrop({ src, mediaType, style }: StoryMediaBackdropProps) {
  if (mediaType !== 'image') return null;
  const sourceOpacity = typeof style?.opacity === 'number' ? style.opacity : 1;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] scale-110 object-cover blur-2xl"
      style={{ ...style, opacity: sourceOpacity * 0.38 }}
      draggable={false}
    />
  );
}
