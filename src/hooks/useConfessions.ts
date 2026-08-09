import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Confession {
  id: string;
  content: string;
  guess_count: number;
  created_at: string;
}

const GUESSES_KEY = 'twib-confession-guesses';

export function getGuessedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(GUESSES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function markGuessed(id: string) {
  try {
    const ids = getGuessedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(GUESSES_KEY, JSON.stringify(ids));
    }
  } catch {
    // storage unavailable — ignore
  }
}

export function useConfessions(limit = 5) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['confessions'],
    queryFn: async (): Promise<Confession[]> => {
      const { data, error } = await (supabase as any)
        .from('confessions')
        .select('id, content, guess_count, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });

  const addConfession = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await (supabase as any).from('confessions').insert({ content });
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
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc('increment_confession_guess', {
        confession_id: id,
      });
      if (error) throw error;
    },
    onSuccess: (_: unknown, id: string) => {
      markGuessed(id);
      queryClient.invalidateQueries({ queryKey: ['confessions'] });
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
