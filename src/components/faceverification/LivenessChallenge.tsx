// The on-screen instruction the admin must perform during the liveness run,
// with a real progress bar so they know when a step has been registered.

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, MessageCircle, ScanFace, Smile } from 'lucide-react';
import type { ChallengeInstruction } from '@/lib/security/faceLiveness';
import { cn } from '@/lib/utils';

const INSTRUCTION_ICON: Record<ChallengeInstruction['type'], React.ElementType> = {
  center: ScanFace,
  left: ArrowLeft,
  right: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
  blink: Eye,
  smile: Smile,
  open_mouth: MessageCircle,
};

interface LivenessChallengeProps {
  instruction: ChallengeInstruction | null;
  instructionProgress: number;
  activeIndex: number;
  total: number;
  totalProgress: number;
  className?: string;
}

export default function LivenessChallenge({
  instruction,
  instructionProgress,
  activeIndex,
  total,
  totalProgress,
  className,
}: LivenessChallengeProps) {
  if (!instruction) return null;
  const Icon = INSTRUCTION_ICON[instruction.type] ?? ScanFace;
  const percent = Math.round(instructionProgress * 100);

  return (
    <div className={cn('rounded-2xl border border-border/60 bg-background/90 backdrop-blur px-5 py-4', className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Liveness check</p>
          <p className="truncate font-semibold leading-tight">{instruction.label}</p>
        </div>
        <span className="text-sm font-bold tabular-nums text-primary">{percent}%</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${Math.max(6, percent)}%` }}
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < activeIndex || totalProgress === 1 ? 'bg-primary' : i === activeIndex ? 'bg-primary/40' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}
