interface ReelProgressBarProps {
  progress: number;
}

export default function ReelProgressBar({ progress }: ReelProgressBarProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-[2px] bg-white/15">
      <div
        className="h-full rounded-r-full bg-primary transition-[width] duration-100 ease-linear"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
