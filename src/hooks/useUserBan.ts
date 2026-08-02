import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BanInfo {
  reason: string;
  expires_at: string | null;
}

export function useUserBan() {
  const { user } = useAuth();
  const [isBanned, setIsBanned] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBanStatus = async () => {
      if (!user) {
        setIsBanned(false);
        setBanInfo(null);
        setLoading(false);
        return;
      }

      try {
        // Check if user has an active ban
        const { data, error } = await supabase
          .from('user_bans')
          .select('reason, expires_at')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error checking ban status:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Check if ban has expired
          if (data.expires_at && new Date(data.expires_at) < new Date()) {
            // Ban has expired, mark as not banned
            setIsBanned(false);
            setBanInfo(null);
          } else {
            setIsBanned(true);
            setBanInfo({
              reason: data.reason,
              expires_at: data.expires_at,
            });
          }
        } else {
          setIsBanned(false);
          setBanInfo(null);
        }
      } catch (err) {
        console.error('Error checking ban status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkBanStatus();
  }, [user]);

  return { isBanned, banInfo, loading };
}
