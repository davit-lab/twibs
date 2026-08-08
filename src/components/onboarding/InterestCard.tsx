import { cn } from '@/lib/utils';
import {
  Laptop,
  Palette,
  Music,
  Trophy,
  Gamepad2,
  Plane,
  Utensils,
  Shirt,
  BookOpen,
  Clapperboard,
  Dumbbell,
  Camera,
  Briefcase,
  FlaskConical,
  Leaf,
  Check,
  LucideIcon,
} from 'lucide-react';

interface InterestCardProps {
  name: string;
  icon: string;
  color: string;
  selected: boolean;
  onToggle: () => void;
}

const iconMap: Record<string, LucideIcon> = {
  laptop: Laptop,
  palette: Palette,
  music: Music,
  trophy: Trophy,
  'gamepad-2': Gamepad2,
  plane: Plane,
  utensils: Utensils,
  shirt: Shirt,
  'book-open': BookOpen,
  clapperboard: Clapperboard,
  dumbbell: Dumbbell,
  camera: Camera,
  briefcase: Briefcase,
  'flask-conical': FlaskConical,
  leaf: Leaf,
};

export default function InterestCard({
  name,
  icon,
  color,
  selected,
  onToggle,
}: InterestCardProps) {
  const Icon = iconMap[icon] || Laptop;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={
        selected
          ? ({
              '--cat': color,
              background: `linear-gradient(160deg, ${color} 0%, ${color}E6 100%)`,
              boxShadow: `0 14px 34px -12px ${color}CC, inset 0 0 0 1px rgba(255,255,255,0.22)`,
            } as React.CSSProperties)
          : ({ '--cat': color } as React.CSSProperties)
      }
      className={cn(
        'group relative flex flex-col items-center justify-center gap-2.5 w-full p-4 sm:p-5 rounded-2xl border transition-all duration-200 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected
          ? 'border-transparent -translate-y-0.5'
          : 'border-border/80 bg-card hover:-translate-y-0.5 hover:border-border hover:shadow-[0_12px_28px_-14px_var(--cat)]'
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 grid place-items-center w-5 h-5 rounded-full bg-white/95 shadow-sm">
          <Check className="w-3 h-3" style={{ color }} strokeWidth={3.5} />
        </span>
      )}

      <span
        className="grid place-items-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl transition-all duration-200 group-hover:scale-105"
        style={{
          backgroundColor: selected ? 'rgba(255,255,255,0.24)' : `${color}18`,
        }}
      >
        <Icon
          className={cn('w-6 h-6 sm:w-7 sm:h-7 transition-transform duration-200', selected && 'scale-110')}
          style={{ color: selected ? '#ffffff' : color }}
          strokeWidth={selected ? 2.25 : 2}
        />
      </span>

      <span
        className={cn(
          'text-[13px] sm:text-sm leading-tight text-center transition-colors duration-200',
          selected
            ? 'font-bold text-white'
            : 'font-semibold text-muted-foreground group-hover:text-foreground'
        )}
      >
        {name}
      </span>
    </button>
  );
}
