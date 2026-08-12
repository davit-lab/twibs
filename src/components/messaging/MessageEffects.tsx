import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { MessageEffectType } from '@/hooks/useMessages';

interface Particle {
  id: number;
  x: number;
  emoji: string;
  delay: number;
  duration: number;
  size: number;
  angle: number;
}

const EFFECT_EMOJIS: Record<MessageEffectType, string[]> = {
  confetti: ['🎊', '🎉', '✨', '🎈', '💜'],
  fireworks: ['🎆', '🎇', '✨', '🌟'],
  laser: ['🔴', '🟡', '🟢', '🔵'],
  fire: ['🔥', '✨', '🌟'],
  halo: ['⭐', '✨', '🌟'],
};

function buildParticles(effect: MessageEffectType): Particle[] {
  const emojis = EFFECT_EMOJIS[effect];
  return Array.from({ length: 26 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    delay: Math.random() * 0.25,
    duration: 1.4 + Math.random() * 0.8,
    size: 14 + Math.random() * 14,
    angle: -90 + (Math.random() * 160 - 80),
  }));
}

export default function MessageEffects({ effect }: { effect: MessageEffectType }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setParticles(buildParticles(effect));
    const t = setTimeout(() => setDone(true), 3200);
    return () => clearTimeout(t);
  }, [effect]);

  if (done) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute select-none"
          style={{ left: `${p.x}%`, top: '20%', fontSize: p.size }}
          initial={{ opacity: 0, scale: 0.3, x: 0, y: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.3, 1.1, 1, 0.8],
            x: [0, Math.cos((p.angle * Math.PI) / 180) * 220],
            y: [0, Math.sin((p.angle * Math.PI) / 180) * 220 + 140],
            rotate: [0, p.angle * 2],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  );
}
