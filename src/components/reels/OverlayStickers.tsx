import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Vote, BrainCircuit, Library } from 'lucide-react';
import { ReelOverlay } from '@/hooks/useReels';
import { cn } from '@/lib/utils';

export default function OverlayStickers({ overlay }: { overlay?: ReelOverlay | null }) {
  const [selection, setSelection] = useState<number | null>(null);

  if (!overlay) return null;

  return (
    <AnimatePresence mode="wait">
      {overlay.type === 'poll' && (
        <motion.div
          key={overlay.question}
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          className="pointer-events-auto absolute bottom-44 left-1/2 z-30 w-[min(86%,330px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/60 p-4 shadow-xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/25">
              <Vote className="h-3.5 w-3.5 text-violet-300" />
            </span>
            <p className="text-sm font-semibold text-white">{overlay.question}</p>
          </div>
          <div className="space-y-2">
            {overlay.options.map((option, i) => {
              const picked = selection === i;
              const revealed = selection !== null;
              return (
                <button
                  key={i}
                  onClick={() => !revealed && setSelection(i)}
                  className={cn(
                    'relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all',
                    revealed
                      ? 'cursor-default'
                      : 'bg-white/10 text-white hover:bg-white/20 active:scale-[0.98]',
                    picked && 'ring-2 ring-primary'
                  )}
                >
                  {revealed && picked && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="absolute inset-0 bg-violet-500/40"
                    />
                  )}
                  <span className={cn('relative z-10', !revealed && 'text-white/90')}>
                    {revealed && picked && '✓ '}
                    {option}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {overlay.type === 'quiz' && (
        <motion.div
          key={overlay.question}
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          className="pointer-events-auto absolute bottom-44 left-1/2 z-30 w-[min(86%,330px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/60 p-4 shadow-xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/25">
              <BrainCircuit className="h-3.5 w-3.5 text-violet-300" />
            </span>
            <p className="text-sm font-semibold text-white">{overlay.question}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {overlay.options.map((option, i) => {
              const picked = selection === i;
              const revealed = selection !== null;
              const correct = revealed && i === overlay.correctIndex;
              return (
                <button
                  key={i}
                  onClick={() => !revealed && setSelection(i)}
                  className={cn(
                    'relative overflow-hidden rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all',
                    revealed
                      ? 'cursor-default'
                      : 'bg-white/10 text-white hover:bg-white/20 active:scale-[0.98]',
                    revealed && correct && 'ring-2 ring-emerald-400',
                    revealed && picked && !correct && 'ring-2 ring-rose-400 opacity-70'
                  )}
                >
                  {revealed && correct && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="absolute inset-0 bg-emerald-500/40"
                    />
                  )}
                  <span className="relative z-10 text-white/90">{option}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {overlay.type === 'qna' && (
        <motion.button
          key={overlay.question}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="pointer-events-auto absolute bottom-44 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/15 bg-black/60 py-2.5 pl-2.5 pr-5 shadow-lg shadow-black/40 backdrop-blur-xl transition-transform active:scale-95"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/25">
            <HelpCircle className="h-4 w-4 text-violet-300" />
          </span>
          <span className="text-sm font-semibold text-white">Q&A: {overlay.question}</span>
        </motion.button>
      )}

      {overlay.type === 'library' && (
        <motion.div
          key={overlay.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="pointer-events-auto absolute bottom-44 left-1/2 z-30 flex w-[min(86%,330px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-black/60 p-3 shadow-lg shadow-black/40 backdrop-blur-xl"
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
            <Library className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{overlay.title}</p>
            <p className="text-xs text-white/50">{overlay.subtitle || 'Added to Library'}</p>
          </div>
          {overlay.url && (
            <Link
              to={overlay.url}
              className="flex-shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white/85"
            >
              Open
            </Link>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
