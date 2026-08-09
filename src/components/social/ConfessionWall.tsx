import { useState } from 'react';
import { Ghost, Check, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useConfessions, getGuessedIds } from '@/hooks/useConfessions';

export default function ConfessionWall() {
  const { data: confessions, isLoading, isError, addConfession, guessConfession } = useConfessions();
  const [draft, setDraft] = useState('');
  const [guessedIds, setGuessedIds] = useState<string[]>(() => getGuessedIds());

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addConfession.mutate(text, {
      onSuccess: () => setDraft(''),
    });
  };

  const guess = (id: string) => {
    setGuessedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    guessConfession.mutate(id);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Ghost className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm">Confession wall</h3>
      </div>

      <div className="p-4 border-b border-border/60">
        <div className="relative">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 280))}
            placeholder="Spill it. Anonymously…"
            rows={2}
            className="resize-none text-sm pr-9"
          />
          <Lock className="absolute top-2.5 right-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground font-medium">{draft.length}/280</span>
          <Button size="sm" onClick={submit} disabled={!draft.trim() || addConfession.isPending}>
            {addConfession.isPending ? 'Posting…' : 'Confess'}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border/40">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : confessions.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            {isError
              ? 'The confession wall is warming up — check back soon.'
              : 'No confessions yet — be the first to spill.'}
          </p>
        ) : (
          confessions.map((confession) => {
            const guessed = guessedIds.includes(confession.id);
            return (
              <div key={confession.id} className="px-4 py-3">
                <p className="text-sm leading-snug line-clamp-3">{confession.content}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(confession.created_at))} ago
                  </span>
                  <span className="flex items-center gap-1">
                    <Ghost className="h-3 w-3" />
                    {confession.guess_count}{' '}
                    {confession.guess_count === 1 ? 'person has' : 'people have'} a guess
                  </span>
                  <button
                    onClick={() => guess(confession.id)}
                    disabled={guessed}
                    className={
                      guessed
                        ? 'flex items-center gap-1 text-primary font-semibold'
                        : 'flex items-center gap-1 font-semibold hover:text-primary transition-colors'
                    }
                  >
                    {guessed ? (
                      <>
                        <Check className="h-3 w-3" /> Guessed
                      </>
                    ) : (
                      'Guess'
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
