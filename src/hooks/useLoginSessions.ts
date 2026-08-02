import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface LoginSession {
  id: string;
  user_id: string;
  device_name: string | null;
  device_type: string | null;
  location: string | null;
  ip_address: string | null;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

export function useLoginSessions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  const fetchSessions = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('login_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('last_active_at', { ascending: false });

      if (error) throw error;
      setSessions((data || []) as LoginSession[]);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('login_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      
      setSessions(sessions.filter(s => s.id !== sessionId));
      toast({
        title: 'Session revoked',
        description: 'The device has been logged out.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to revoke session',
      });
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      const { error } = await supabase
        .from('login_sessions')
        .delete()
        .eq('user_id', user?.id)
        .eq('is_current', false);

      if (error) throw error;
      
      setSessions(sessions.filter(s => s.is_current));
      toast({
        title: 'All other sessions revoked',
        description: 'All other devices have been logged out.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to revoke sessions',
      });
    }
  };

  return {
    sessions,
    loading,
    revokeSession,
    revokeAllOtherSessions,
    refetch: fetchSessions,
  };
}
