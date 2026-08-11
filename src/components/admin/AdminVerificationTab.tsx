import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Loader2, BadgeCheck, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { VerificationRequestData } from './types';
import AdminSection from './AdminSection';

export default function AdminVerificationTab() {
  const { writeAudit } = useAdminActions();
  const [requests, setRequests] = useState<VerificationRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: verifData } = await (supabase as any)
        .from('verification_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (verifData && verifData.length > 0) {
        const ids = [...new Set(verifData.map((v: any) => v.user_id))];
        const { data: profiles } = await (supabase as any)
          .from('profiles').select('user_id, display_name, username, avatar_url, is_verified').in('user_id', ids);
        const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
        setRequests(verifData.map((v: any) => ({ ...v, profile: pmap.get(v.user_id) || null })));
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Error loading verification requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handle = async (requestId: string, approve: boolean) => {
    setBusyId(requestId);
    try {
      const { error } = await (supabase as any).rpc('handle_verification_request', {
        request_id: requestId,
        approve,
      });
      if (error) throw error;
      await writeAudit(approve ? 'approve_verification' : 'reject_verification', 'verification', requestId);
      setRequests(prev => prev.filter(v => v.id !== requestId));
      toast({ title: approve ? 'Verification approved' : 'Verification rejected' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Failed to process request.' });
    } finally {
      setBusyId(null);
    }
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <AdminSection
      icon={BadgeCheck}
      title="Verification Requests"
      eyebrow="Trust"
      description="Approve or reject profile verification requests"
      actions={
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      }
    >
        {loading ? (
          <div className="py-14 text-center"><Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <BadgeCheck className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-bold text-lg mb-1">No pending requests</p>
            <p className="text-sm text-muted-foreground">Users can request verification from their profile.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="rounded-xl border border-border/60 p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={request.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{initials(request.profile?.display_name || 'U')}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium flex items-center gap-1.5">
                      {request.profile?.display_name || 'Unknown'}
                      {request.profile?.is_verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    </p>
                    <p className="text-sm text-muted-foreground">@{request.profile?.username || 'unknown'}</p>
                    {request.message && (
                      <p className="text-sm text-muted-foreground mt-1.5 rounded-lg bg-muted/40 p-2.5 line-clamp-3">
                        {request.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Requested {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {request.profile?.is_verified && <Badge>Already verified</Badge>}
                  <Button size="sm" onClick={() => handle(request.id, true)} disabled={busyId === request.id} className="gap-1.5">
                    {busyId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handle(request.id, false)} disabled={busyId === request.id} className="gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </AdminSection>
  );
}
