// Guards the "business-owned post" embed in feed queries.
//
// The embed `business_account:advertiser_accounts(...)` only works after the
// business migration (20260925000000_business_accounts.sql) is applied to the
// live database. Before that, PostgREST fails the WHOLE query with
// "Could not find a relationship..." — which would take down the feed.
//
// We probe once (does `posts.business_id` exist?) and, if not, drop the embed
// so the feed keeps working until the migration runs. The probe result is
// cached for the browser session; a refresh picks up the new state after the
// migration is applied.

import { supabase } from '@/integrations/supabase/client';

export const BUSINESS_ACCOUNT_EMBED = `,
  business_account:advertiser_accounts (
    id,
    name,
    username,
    avatar_url,
    account_type
  )
`;

let support: 'unknown' | 'yes' | 'no' = 'unknown';
let probe: Promise<boolean> | null = null;

export function businessPostSupport(): Promise<boolean> {
  if (support !== 'unknown') return Promise.resolve(support === 'yes');
  if (!probe) {
    probe = (async () => {
      try {
        const { error } = await (supabase as any).from('posts').select('business_id').limit(1);
        const message: string = error?.message ?? '';
        const code: string | undefined = error?.code;
        if (error && (code === '42703' || /does not exist/i.test(message))) {
          support = 'no';
          return false;
        }
        support = 'yes';
        return true;
      } catch {
        // Probe failed for a non-schema reason (e.g. network). Assume the
        // embed is fine and let the real query surface any error.
        support = 'yes';
        return true;
      }
    })();
  }
  return probe;
}

/** Returns the embed snippet if the schema supports it, else an empty string. */
export function businessAccountEmbed(): Promise<string> {
  return businessPostSupport().then((ok) => (ok ? BUSINESS_ACCOUNT_EMBED : ''));
}