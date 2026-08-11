import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, FileText, BookOpen, Clapperboard, BadgeCheck, Ban, Loader2 } from 'lucide-react';

export default function AdminStats() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const countQuery = (table: string, filter?: (q: any) => any) => {
        let q: any = (supabase as any).from(table).select('*', { count: 'exact', head: true });
        if (filter) q = filter(q);
        return q.then((r: any) => r.count ?? 0);
      };
      const [users, posts, books, reels, verified, banned] = await Promise.all([
        countQuery('profiles', (q) => q.is('deleted_at', null)),
        countQuery('posts'),
        countQuery('books', (q) => q.eq('status', 'published')),
        countQuery('reels'),
        countQuery('profiles', (q) => q.eq('is_verified', true).is('deleted_at', null)),
        countQuery('user_bans', (q) => q.eq('is_active', true)),
      ]);
      if (mounted) setStats({ users, posts, books, reels, verified, banned });
    })();
    return () => { mounted = false; };
  }, []);

  const cards = stats ? [
    { label: 'Total Users', value: stats.users, icon: Users },
    { label: 'Total Posts', value: stats.posts, icon: FileText },
    { label: 'Published Books', value: stats.books, icon: BookOpen },
    { label: 'Reels', value: stats.reels, icon: Clapperboard },
    { label: 'Verified', value: stats.verified, icon: BadgeCheck },
    { label: 'Suspended', value: stats.banned, icon: Ban },
  ] : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
      {cards ? cards.map((c) => (
        <div key={c.label} className="admin-stat-tile">
          <div className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
            <c.icon className="w-[18px] h-[18px]" />
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
            {c.value.toLocaleString()}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
            {c.label}
          </p>
        </div>
      )) : (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="admin-stat-tile h-[104px] flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ))
      )}
    </div>
  );
}
