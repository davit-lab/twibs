import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
        countQuery('profiles'),
        countQuery('posts'),
        countQuery('books', (q) => q.eq('status', 'published')),
        countQuery('reels'),
        countQuery('profiles', (q) => q.eq('is_verified', true)),
        countQuery('user_bans', (q) => q.eq('is_active', true)),
      ]);
      if (mounted) setStats({ users, posts, books, reels, verified, banned });
    })();
    return () => { mounted = false; };
  }, []);

  const cards = stats ? [
    { label: 'Total Users', value: stats.users, icon: Users, bg: 'bg-primary/10', color: 'text-primary' },
    { label: 'Total Posts', value: stats.posts, icon: FileText, bg: 'bg-accent/10', color: 'text-accent' },
    { label: 'Published Books', value: stats.books, icon: BookOpen, bg: 'bg-star/10', color: 'text-star' },
    { label: 'Reels', value: stats.reels, icon: Clapperboard, bg: 'bg-pink-500/10', color: 'text-pink-500' },
    { label: 'Verified', value: stats.verified, icon: BadgeCheck, bg: 'bg-verified/10', color: 'text-primary' },
    { label: 'Suspended', value: stats.banned, icon: Ban, bg: 'bg-destructive/10', color: 'text-destructive' },
  ] : null;

  if (!cards) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
