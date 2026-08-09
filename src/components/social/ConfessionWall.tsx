import { useState } from 'react';
import { Ghost, Check, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { useConfessions, MAX_GUESSES, Friend } from '@/hooks/useConfessions';

export default function ConfessionWall() {
  const { data, isLoading, isError, addConfession, guessConfession } = useConfessions();
  const [draft, setDraft] = useState('');
  const [guessTarget, setGuessTarget] = useState<{ id: string; content: string } | null>(null);

  const confessions = data?.confessions || [];
  const myGuesses = data?.myGuesses || {};
  const friends = data?.friends || [];

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addConfession.mutate(text, {
      onSuccess: () => setDraft(''),
    });
  };

  const pickFriend = (friend: Friend) => {
    if (!guessTarget) return;
    guessConfession.mutate({
      confessionId: guessTarget.id,
      guessedUserId: friend.user_id,
    });
    setGuessTarget(null);
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
          <span className="text-xs text-muted-foreground font-medium">
            {draft.length}/280 · fresh each day
          </span>
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
              : 'No confessions today — be the first to spill.'}
          </p>
        ) : (
          confessions.map((confession) => {
            const used = myGuesses[confession.id] || 0;
            const chancesLeft = Math.max(0, MAX_GUESSES - used);
            return (
              <div key={confession.id} className="px-4 py-3">
                <p className="text-sm leading-snug line-clamp-3">{confession.content}</p>

                {confession.revealed && confession.author_profile ? (
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={confession.author_profile.avatar_url || undefined} />
                      <AvatarFallback>
                        {(confession.author_profile.display_name || confession.author_profile.username)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-primary font-semibold">
                      It was @{confession.author_profile.username}
                    </span>
                    <span className="text-muted-foreground">· cracked by someone</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(confession.created_at))} ago
                    </span>
                    <span className="flex items-center gap-1">
                      <Ghost className="h-3 w-3" />
                      {confession.guess_count}{' '}
                      {confession.guess_count === 1 ? 'person has' : 'people have'} a guess
                    </span>
                    {chancesLeft > 0 ? (
                      <button
                        onClick={() =>
                          setGuessTarget({ id: confession.id, content: confession.content })
                        }
                        disabled={!friends.length}
                        className="flex items-center gap-1 font-semibold hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Users className="h-3 w-3" /> Guess ({chancesLeft} left)
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-primary font-semibold">
                        <Check className="h-3 w-3" /> Out of chances
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!guessTarget} onOpenChange={(open) => !open && setGuessTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Who wrote it?</DialogTitle>
            <DialogDescription>
              Pick one of your friends. You have {MAX_GUESSES} guesses per confession.
            </DialogDescription>
          </DialogHeader>

          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You need friends to guess. Follow a few people (both of you follow each other) and
              come back.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
              {friends.map((friend) => (
                <button
                  key={friend.user_id}
                  onClick={() => pickFriend(friend)}
                  disabled={guessConfession.isPending}
                  className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback>
                      {(friend.display_name || friend.username).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {friend.display_name || friend.username}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      @{friend.username}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
