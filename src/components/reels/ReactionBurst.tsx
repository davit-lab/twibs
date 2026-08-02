import { AnimatePresence, motion } from 'framer-motion';

export interface ReactionItem {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

export default function ReactionBurst({ reactions }: { reactions: ReactionItem[] }) {
  return (
    <AnimatePresence>
      {reactions.map((r) => (
        <motion.span
          key={r.id}
          className="pointer-events-none absolute z-40 select-none text-4xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          style={{ left: r.x, top: r.y, x: '-50%' }}
          initial={{ opacity: 0, scale: 0.4, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.25, 1, 0.85], y: -180 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        >
          {r.emoji}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}
