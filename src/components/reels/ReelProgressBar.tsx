interface ReelProgressBarProps {
  progress: number;
  onSeek?: (progress: number) => void;
}

export default function ReelProgressBar({ progress, onSeek }: ReelProgressBarProps) {
  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    onSeek(Math.min(100, Math.max(0, next)));
  };

  return (
    <div
      className="absolute inset-x-0 top-0 z-20 h-1 cursor-pointer bg-white/20"
      onPointerDown={handlePointer}
      onPointerMove={(event) => {
        if (event.buttons === 1) handlePointer(event);
      }}
      aria-label="Seek reel"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full rounded-r-full bg-white transition-[width] duration-100 ease-linear"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
