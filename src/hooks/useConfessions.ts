import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Confession {
  id: string;
  content: string;
  guess_count: number;
  revealed: boolean;
  author_id: string | null;
  created_at: string;
  author_profile?: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface Friend {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const MAX_GUESSES = 2;

export function useConfessions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['confessions', user?.id, new Date().toDateString()],
    queryFn: async () => {
      const todayStart = startOfToday().toISOString();

      // Only today's confessions (the wall resets daily)
      const { data: rows, error } = await (supabase as any)
        .from('confessions_public')
        .select('id, content, guess_count, revealed, author_id, created_at')
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      let confessions = (rows || []) as Confession[];

      // Fetch author profiles for revealed confessions
      const authorIds = [
        ...new Set(confessions.filter((c) => c.revealed && c.author_id).map((c) => c.author_id)),
      ] as string[];
      if (authorIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', authorIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
        confessions = confessions.map((c) => ({
          ...c,
          author_profile: c.author_id ? profileMap.get(c.author_id) || null : null,
        }));
      }

      // How many guesses I've used on each confession
      let myGuesses: Record<string, number> = {};
      if (user) {
        const { data: guesses } = await (supabase as any)
          .from('confession_guesses')
          .select('confession_id')
          .eq('guesser_id', user.id);
        for (const g of guesses || []) {
          myGuesses[g.confession_id] = (myGuesses[g.confession_id] || 0) + 1;
        }
      }

      // Friends = mutual follows (both follow each other, accepted)
      let friends: Friend[] = [];
      if (user) {
        const [{ data: following }, { data: followers }] = await Promise.all([
          (supabase as any)
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id)
            .eq('status', 'accepted'),
          (supabase as any)
            .from('follows')
            .select('follower_id')
            .eq('following_id', user.id)
            .eq('status', 'accepted'),
        ]);
        const followingSet = new Set((following || []).map((f: any) => f.following_id));
        const friendIds = [
          ...new Set(
            (followers || [])
              .map((f: any) => f.follower_id)
              .filter((id: string) => followingSet.has(id))
          ),
        ];
        if (friendIds.length > 0) {
          const { data: profiles } = await (supabase as any)
            .from('profiles')
            .select('user_id, username, display_name, avatar_url')
            .in('user_id', friendIds);
          friends = profiles || [];
        }
      }

      return { confessions, myGuesses, friends };
    },
  });

  const addConfession = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('confessions')
        .insert({ user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['confessions'] });
      toast({
        title: 'Confession posted',
        description: 'Your secret is safe. Nobody knows it was you.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Could not post',
        description: error?.message || 'Something went wrong. Please try again.',
      });
    },
  });

  const guessConfession = useMutation({
    mutationFn: async ({
      confessionId,
      guessedUserId,
    }: {
      confessionId: string;
      guessedUserId: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('confession_guess', {
        p_confession_id: confessionId,
        p_guessed_user_id: guessedUserId,
      });
      if (error) throw error;
      return data as {
        correct: boolean;
        revealed: boolean;
        guesses_left: number;
        author_id: string | null;
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['confessions'] });
      if (result.correct) {
        toast({
          title: 'Correct! 🎉',
          description: 'You cracked it — the confession has been revealed.',
        });
      } else {
        toast({
          title: 'Not them',
          description: `That friend wasn't it. ${result.guesses_left} guess${result.guesses_left === 1 ? '' : 'es'} left.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Could not guess',
        description: error?.message || 'Something went wrong. Please try again.',
      });
    },
  });

  return { data, isLoading, isError, addConfession, guessConfession };
}
