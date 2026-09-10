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

export function getInterestIcon(icon: string): LucideIcon {
  return iconMap[icon] || Laptop;
}

export default function InterestCard({
  name,
  icon,
  selected,
  onToggle,
}: InterestCardProps) {
  const Icon = getInterestIcon(icon);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group relative flex items-center gap-3 w-full p-3 rounded-xl border transition-all duration-200 ease-out text-left',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/80 bg-card hover:bg-surface-2/60 hover:border-border'
      )}
    >
      <span
        className={cn(
          'grid place-items-center w-11 h-11 shrink-0 rounded-xl transition-colors duration-200',
          selected
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-2 text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon className="w-5 h-5" strokeWidth={selected ? 2.25 : 2} />
      </span>

      <span
        className={cn(
          'flex-1 text-sm leading-tight transition-colors duration-200',
          selected
            ? 'font-bold text-foreground'
            : 'font-medium text-muted-foreground group-hover:text-foreground'
        )}
      >
        {name}
      </span>

      <span
        className={cn(
          'grid place-items-center w-5 h-5 shrink-0 rounded-full border transition-colors duration-200',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-transparent'
        )}
      >
        <Check className="w-3 h-3" strokeWidth={3.5} />
      </span>
    </button>
  );
}