import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface InterestCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface UserInterest {
  id: string;
  user_id: string;
  category_id: string;
  created_at: string;
}

export function useInterestCategories() {
  return useQuery({
    queryKey: ['interest-categories'],
    queryFn: async (): Promise<InterestCategory[]> => {
      const { data, error } = await (supabase as any)
        .from('interest_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 60, // 1 hour - categories rarely change
  });
}

export function useUserInterests(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-interests', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await (supabase as any)
        .from('user_interests')
        .select(`
          id,
          category_id,
          created_at,
          interest_categories (
            id,
            name,
            icon,
            color
          )
        `)
        .eq('user_id', targetUserId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!targetUserId,
  });
}

export function useInterestActions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveInterests = useMutation({
    mutationFn: async (categoryIds: string[]) => {
      if (!user) throw new Error('Not authenticated');

      // Delete existing interests
      const { error: deleteError } = await (supabase as any)
        .from('user_interests')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Insert new interests
      if (categoryIds.length > 0) {
        const { error: insertError } = await (supabase as any)
          .from('user_interests')
          .insert(
            categoryIds.map(categoryId => ({
              user_id: user.id,
              category_id: categoryId,
            }))
          );

        if (insertError) throw insertError;
      }

      return categoryIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
      toast({
        title: 'Interests saved!',
        description: 'Your interests have been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save interests',
        description: error.message,
      });
    },
  });

  const addInterest = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('user_interests')
        .insert({ user_id: user.id, category_id: categoryId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
    },
  });

  const removeInterest = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('user_interests')
        .delete()
        .eq('user_id', user.id)
        .eq('category_id', categoryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-interests'] });
    },
  });

  return {
    saveInterests,
    addInterest,
    removeInterest,
  };
}

export function useHasCompletedOnboarding() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['onboarding-complete', user?.id],
    queryFn: async () => {
      if (!user) return false;

      const { count, error } = await (supabase as any)
        .from('user_interests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (error) return false;
      return (count || 0) > 0;
    },
    enabled: !!user,
  });
}
