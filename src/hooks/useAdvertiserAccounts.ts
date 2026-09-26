import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  AdvertiserAccount,
  AdvertiserAccountType,
  AudienceEstimate,
} from '@/lib/ads';
import { friendlyErrorMessage } from '@/lib/errors';

const AVATAR_BUCKET = 'avatars';

export interface AdvertiserAccountInput {
  account_type: AdvertiserAccountType;
  name: string;
  username: string;
  category?: string;
  description?: string;
  avatar_url?: string;
  cover_url?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
}

const rpc = (supabase as any).rpc.bind(supabase);

export function useAdvertiserAccounts() {
  const [accounts, setAccounts] = useState<AdvertiserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: authData } = await (supabase as any).auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) {
        setAccounts([]);
        return;
      }
      const { data, error } = await (supabase as any)
        .from('advertiser_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(friendlyErrorMessage(error, 'Failed to load professional accounts'));
      setAccounts((data as AdvertiserAccount[]) || []);
    } catch (err: unknown) {
      setError(friendlyErrorMessage(err, 'Failed to load professional accounts'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = useCallback(async (input: AdvertiserAccountInput) => {
    // Business-like identities are routed through the unified create_account
    // RPC so they are seeded as real teams (owner membership row, settings and
    // wallet) exactly like accounts made in the Business area. Previously this
    // screen called create_advertiser_account directly, which produced a
    // "business" with no team at all -- it could not be managed, invited to, or
    // billed, and showed up in the account switcher with no role.
    // `personal` stays on create_advertiser_account (advertising only).
    const isBusinessLike = input.account_type !== 'personal';

    const { data, error } = isBusinessLike
      ? await rpc('create_account', {
          p_account_type: input.account_type,
          p_name: input.name,
          p_username: input.username,
          p_category: input.category || null,
          p_description: input.description || null,
          p_avatar_url: input.avatar_url || null,
          p_cover_url: input.cover_url || null,
          p_website: input.website || null,
          p_location: input.location || null,
          p_goals: [],
          p_contact_email: input.contact_email || null,
          p_contact_phone: input.contact_phone || null,
        })
      : await rpc('create_advertiser_account', {
          p_account_type: input.account_type,
          p_name: input.name,
          p_username: input.username,
          p_category: input.category || null,
          p_description: input.description || null,
          p_avatar_url: input.avatar_url || null,
          p_cover_url: input.cover_url || null,
          p_website: input.website || null,
          p_contact_email: input.contact_email || null,
          p_contact_phone: input.contact_phone || null,
          p_location: input.location || null,
        });
    if (error) throw new Error(friendlyErrorMessage(error, 'Could not create the account.'));
    await fetchAccounts();
    return data as AdvertiserAccount;
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (accountId: string, updates: Partial<AdvertiserAccountInput>) => {
    const { data, error } = await rpc('update_advertiser_account', {
      p_account_id: accountId,
      p_name: updates.name ?? null,
      p_category: updates.category ?? null,
      p_description: updates.description ?? null,
      p_avatar_url: updates.avatar_url ?? null,
      p_cover_url: updates.cover_url ?? null,
      p_website: updates.website ?? null,
      p_contact_email: updates.contact_email ?? null,
      p_contact_phone: updates.contact_phone ?? null,
      p_location: updates.location ?? null,
    });
    if (error) throw new Error(friendlyErrorMessage(error, 'Could not update the account.'));
    await fetchAccounts();
    return data as AdvertiserAccount;
  }, [fetchAccounts]);

  const deleteAccount = useCallback(
    async (accountId: string) => {
      const { error } = await rpc('delete_advertiser_account', {
        p_account_id: accountId,
      });
      if (error) throw new Error(friendlyErrorMessage(error, 'Could not delete the account.'));
      await fetchAccounts();
    },
    [fetchAccounts]
  );

  const uploadAvatar = useCallback(async (accountId: string, file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Maximum file size is 5MB.');
    const { user } = (await (supabase as any).auth.getUser()).data || {};
    if (!user?.id) throw new Error('Not authenticated');
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/advertiser/${accountId}.${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(fileName, file, { upsert: true });
    if (uploadError) throw new Error(friendlyErrorMessage(uploadError, 'Could not upload the image.'));
    const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fileName);
    return urlData.publicUrl;
  }, []);

  return { accounts, loading, error, createAccount, updateAccount, deleteAccount, uploadAvatar, refresh: fetchAccounts };
}

export function useAudienceEstimate() {
  const estimate = useCallback(
    async (targeting: {
      automatic: boolean;
      locations: string[];
      languages: string[];
      interests: string[];
    }): Promise<AudienceEstimate> => {
      const { data, error } = await rpc('estimate_audience', {
        p_automatic: targeting.automatic,
        p_locations: targeting.locations,
        p_languages: targeting.languages,
        p_interests: targeting.interests,
      });
      if (error) throw new Error(friendlyErrorMessage(error, 'Could not estimate the audience.'));
      return data as AudienceEstimate;
    },
    []
  );
  return { estimate };
}
