import { useCallback, useEffect, useState } from 'react';
import { Compass, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminSection from './AdminSection';

interface CategoryRow { id: string; name: string; icon: string; color: string; active: boolean; sort_order: number; follower_count: number; post_count: number; }
interface GroupRow { id: string; name: string; slug: string; privacy: string; creator_id: string; creator_name: string | null; creator_username: string | null; member_count: number; post_count: number; created_at: string; }

export default function AdminCommunitiesTab() {
  const { deleteContent } = useAdminActions();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [categoryResult, groupResult] = await Promise.all([
      (supabase as any).rpc('admin_list_interest_categories'),
      (supabase as any).rpc('admin_list_groups', { p_search: search.trim() || null, p_limit: 150 }),
    ]);
    if (categoryResult.error || groupResult.error) toast({ variant: 'destructive', title: 'Could not load communities', description: categoryResult.error?.message || groupResult.error?.message });
    else { setCategories(categoryResult.data || []); setGroups(groupResult.data || []); }
    setLoading(false);
  }, [search]);
  useEffect(() => { void load(); }, [load]);

  const saveCategory = async (row: CategoryRow) => {
    setBusy(row.id);
    const { error } = await (supabase as any).rpc('admin_save_interest_category', { p_id: row.id, p_name: row.name, p_icon: row.icon, p_color: row.color, p_active: row.active, p_sort_order: row.sort_order });
    setBusy(null);
    if (error) toast({ variant: 'destructive', title: 'Could not save topic', description: error.message }); else { toast({ title: 'Topic saved' }); void load(); }
  };

  const createCategory = async () => {
    if (newName.trim().length < 2) return;
    setBusy('new');
    const { error } = await (supabase as any).rpc('admin_save_interest_category', { p_id: null, p_name: newName.trim(), p_icon: 'laptop', p_color: '#64748B', p_active: true, p_sort_order: categories.length });
    setBusy(null);
    if (error) toast({ variant: 'destructive', title: 'Could not create topic', description: error.message }); else { setNewName(''); toast({ title: 'Topic created' }); void load(); }
  };

  const removeGroup = async (group: GroupRow) => {
    if (!window.confirm(`Delete “${group.name}” and all of its posts? This cannot be undone.`)) return;
    setBusy(group.id);
    const result = await deleteContent('group', group.id);
    setBusy(null);
    if (result.error) toast({ variant: 'destructive', title: 'Could not delete group', description: result.error }); else { toast({ title: 'Group deleted' }); void load(); }
  };

  return <AdminSection icon={Compass} title="Communities" eyebrow="Community operations" description="Manage interest topics and review groups" actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
    <Tabs defaultValue="topics"><TabsList><TabsTrigger value="topics">Interest topics</TabsTrigger><TabsTrigger value="groups">Groups</TabsTrigger></TabsList>
      <TabsContent value="topics" className="mt-5">
        <div className="mb-4 flex gap-2"><Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createCategory(); }} placeholder="New topic name" className="max-w-sm" /><Button onClick={() => void createCategory()} disabled={busy === 'new' || newName.trim().length < 2}><Plus className="mr-2 h-4 w-4" />Add topic</Button></div>
        {loading ? <Loader2 className="mx-auto my-14 h-7 w-7 animate-spin text-primary" /> : <div className="divide-y divide-border">{categories.map((row) => <div key={row.id} className="grid gap-3 py-4 md:grid-cols-[minmax(160px,1fr)_120px_90px_auto_auto] md:items-center">
          <Input value={row.name} onChange={(e) => setCategories((all) => all.map((item) => item.id === row.id ? { ...item, name: e.target.value } : item))} />
          <Input value={row.icon} onChange={(e) => setCategories((all) => all.map((item) => item.id === row.id ? { ...item, icon: e.target.value } : item))} aria-label="Icon name" />
          <Input type="number" value={row.sort_order} onChange={(e) => setCategories((all) => all.map((item) => item.id === row.id ? { ...item, sort_order: Number(e.target.value) } : item))} aria-label="Sort order" />
          <div className="flex items-center gap-2"><Switch checked={row.active} onCheckedChange={(active) => setCategories((all) => all.map((item) => item.id === row.id ? { ...item, active } : item))} /><span className="text-xs text-muted-foreground">{row.active ? 'Active' : 'Hidden'}</span></div>
          <div className="flex items-center justify-end gap-3"><span className="whitespace-nowrap text-xs text-muted-foreground">{row.follower_count} followers · {row.post_count} posts</span><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void saveCategory(row)}>Save</Button></div>
        </div>)}</div>}
      </TabsContent>
      <TabsContent value="groups" className="mt-5">
        <div className="relative mb-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search groups" className="pl-9" /></div>
        {loading ? <Loader2 className="mx-auto my-14 h-7 w-7 animate-spin text-primary" /> : groups.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No groups found.</p> : <div className="divide-y divide-border">{groups.map((group) => <article key={group.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{group.name}</h3><Badge variant="outline">{group.privacy}</Badge></div><p className="mt-1 text-xs text-muted-foreground">/{group.slug} · {group.creator_name || group.creator_username || 'Unknown creator'} · {group.member_count} members · {group.post_count} posts</p></div><Button size="sm" variant="destructive" disabled={busy === group.id} onClick={() => void removeGroup(group)}>{busy === group.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete group</Button></article>)}</div>}
      </TabsContent>
    </Tabs>
  </AdminSection>;
}

