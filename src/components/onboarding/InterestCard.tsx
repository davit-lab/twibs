import { motion } from 'framer-motion';
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
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 p-5 rounded-xl',
        'border-2 transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        selected
          ? 'border-primary bg-primary/10 shadow-lg'
          : 'border-border hover:border-primary/50 bg-card hover:bg-accent/50'
      )}
    >
      {/* Check indicator */}
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
        >
          <svg
            className="w-3 h-3 text-primary-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}

      {/* Icon with color */}
      <div
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center transition-all',
          selected ? 'scale-110' : ''
        )}
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-7 h-7" style={{ color }} />
      </div>

      {/* Name */}
      <span
        className={cn(
          'font-medium text-sm text-center transition-colors',
          selected ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {name}
      </span>
    </motion.button>
  );
}
