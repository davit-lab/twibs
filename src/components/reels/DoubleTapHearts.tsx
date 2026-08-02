import { AnimatePresence, motion } from 'framer-motion';

export interface BurstHeart {
  id: number;
  x: number;
  y: number;
}

const PARTICLES = 8;

export default function DoubleTapHearts({ hearts }: { hearts: BurstHeart[] }) {
  return (
    <AnimatePresence>
      {hearts.map((heart) => (
        <motion.div
          key={heart.id}
          className="pointer-events-none absolute z-30"
          style={{ left: heart.x, top: heart.y, x: '-50%', y: '-50%' }}
          initial={{ scale: 0, opacity: 0, rotate: -10 }}
          animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1], rotate: [0, 10, 0] }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <span className="text-6xl drop-shadow-[0_0_16px_rgba(244,63,94,0.7)] select-none">❤️</span>

          {PARTICLES > 0 &&
            Array.from({ length: PARTICLES }).map((_, i) => {
              const angle = (i / PARTICLES) * Math.PI * 2;
              const dist = 38 + (i % 3) * 12;
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: ['#f43f5e', '#fb7185', '#fbbf24', '#ffffff'][i % 4],
                    marginLeft: -4,
                    marginTop: -4,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.3 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              );
            })}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
