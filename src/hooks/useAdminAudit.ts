import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  set_user_role: 'Role changed',
  delete_user: 'User deleted',
  purge_all_users: 'Bulk user purge',
  logout_all_sessions: 'Sessions revoked',
  shadow_ban_user: 'Shadow banned',
  unshadow_ban_user: 'Shadow ban lifted',
  hide_content: 'Content hidden',
  unhide_content: 'Content unhidden',
  delete_content: 'Content deleted',
  set_system_setting: 'Setting changed',
};

export function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

export function useAdminAudit() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const fetchEntries = useCallback(async (currentPage: number, currentSearch: string) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('admin_audit_logs')
        .select('id, actor_id, actor_email, action, target_type, target_id, details, created_at', { count: 'exact' });

      if (currentSearch.trim()) {
        const term = `%${currentSearch.trim().toLowerCase()}%`;
        query = query.or(`action.ilike.${term},actor_email.ilike.${term},target_id.ilike.${term}`);
      }

      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setEntries(data || []);
      setTotal(count ?? 0);
    } catch (error) {
      console.error('Error loading audit log:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(page, search);
  }, [page, search, fetchEntries]);

  const refetch = () => fetchEntries(page, search);

  return {
    entries,
    loading,
    total,
    page,
    setPage,
    search,
    setSearch,
    refetch,
    pageSize: PAGE_SIZE,
  };
}
