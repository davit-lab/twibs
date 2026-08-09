import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Shield, Users, FileText, Clapperboard, BookOpen, Flag, BadgeCheck,
  Settings, ScrollText, Loader2, Trash, Crown,
} from 'lucide-react';
import AdminStats from '@/components/admin/AdminStats';
import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminPostsTab from '@/components/admin/AdminPostsTab';
import AdminReelsTab from '@/components/admin/AdminReelsTab';
import AdminBooksTab from '@/components/admin/AdminBooksTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminVerificationTab from '@/components/admin/AdminVerificationTab';
import AdminSettingsTab from '@/components/admin/AdminSettingsTab';
import AdminAuditTab from '@/components/admin/AdminAuditTab';
import PurgeAllUsersDialog from '@/components/admin/PurgeAllUsersDialog';

export default function Admin() {
  const { user, isStaff, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [openReportCount, setOpenReportCount] = useState(0);
  const [pendingVerifyCount, setPendingVerifyCount] = useState(0);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [tabsReady, setTabsReady] = useState(false);

  useEffect(() => {
    if (!authLoading && !isStaff) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access the admin panel.',
        variant: 'destructive',
      });
      navigate('/');
    }
  }, [user, isStaff, authLoading, navigate]);

  useEffect(() => {
    if (!isStaff) return;
    let mounted = true;
    (async () => {
      const [{ count: reports }, { count: verif }] = await Promise.all([
        (supabase as any).from('reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
        (supabase as any).from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      if (mounted) {
        setOpenReportCount(reports ?? 0);
        setPendingVerifyCount(verif ?? 0);
        setTabsReady(true);
      }
    })();
    return () => { mounted = false; };
  }, [isStaff]);

  if (authLoading || !tabsReady) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isStaff) {
    return null;
  }

  return (
    <MainLayout>
      <div className="container py-6 px-4 max-w-7xl">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Admin Panel
                {isSuperAdmin && <Crown className="w-5 h-5 text-amber-500" />}
              </h1>
              <p className="text-muted-foreground">
                {isSuperAdmin
                  ? 'Super Admin · full control'
                  : isAdmin
                    ? 'Administrator access'
                    : 'Moderator / support access'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {user?.email}
            </Badge>
            {isSuperAdmin && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => setPurgeOpen(true)}>
                <Trash className="w-4 h-4" />
                Delete All Users
              </Button>
            )}
          </div>
        </div>

        <AdminStats />

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto w-full lg:w-auto lg:inline-grid lg:grid-cols-8">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-2">
              <FileText className="w-4 h-4" /> Posts
            </TabsTrigger>
            <TabsTrigger value="reels" className="gap-2">
              <Clapperboard className="w-4 h-4" /> Reels
            </TabsTrigger>
            <TabsTrigger value="books" className="gap-2">
              <BookOpen className="w-4 h-4" /> Books
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Flag className="w-4 h-4" /> Reports
              {openReportCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                  {openReportCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="verification" className="gap-2">
              <BadgeCheck className="w-4 h-4" /> Verify
              {pendingVerifyCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {pendingVerifyCount}
                </span>
              )}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="w-4 h-4" /> Settings
              </TabsTrigger>
            )}
            <TabsTrigger value="audit" className="gap-2">
              <ScrollText className="w-4 h-4" /> Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="posts">
            <AdminPostsTab />
          </TabsContent>

          <TabsContent value="reels">
            <AdminReelsTab />
          </TabsContent>

          <TabsContent value="books">
            <AdminBooksTab />
          </TabsContent>

          <TabsContent value="reports">
            <AdminReportsTab />
          </TabsContent>

          <TabsContent value="verification">
            <AdminVerificationTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings">
              <AdminSettingsTab />
            </TabsContent>
          )}

          <TabsContent value="audit">
            <AdminAuditTab />
          </TabsContent>
        </Tabs>
      </div>

      <PurgeAllUsersDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        onDone={() => window.location.reload()}
      />
    </MainLayout>
  );
}
