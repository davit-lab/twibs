import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Users, FileText, Clapperboard, BookOpen, Flag, BadgeCheck,
  Settings, ScrollText, Loader2, Trash, ShieldAlert, ScanFace, Megaphone,
} from 'lucide-react';
import AdminControlCenter from '@/components/admin/AdminControlCenter';
import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminPostsTab from '@/components/admin/AdminPostsTab';
import AdminReelsTab from '@/components/admin/AdminReelsTab';
import AdminBooksTab from '@/components/admin/AdminBooksTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminVerificationTab from '@/components/admin/AdminVerificationTab';
import AdminSettingsTab from '@/components/admin/AdminSettingsTab';
import AdminAuditTab from '@/components/admin/AdminAuditTab';
import AdminDeletedUsersTab from '@/components/admin/AdminDeletedUsersTab';
import AdminFaceAuthTab from '@/components/admin/AdminFaceAuthTab';
import AdminAdsTab from '@/components/admin/AdminAdsTab';
import RedButtonControl from '@/components/admin/security/RedButtonControl';
import PurgeAllUsersDialog from '@/components/admin/PurgeAllUsersDialog';
import { cn } from '@/lib/utils';

const TABS: { value: string; icon: React.ElementType; label: string; staffOnly?: boolean; superOnly?: boolean }[] = [
  { value: 'users', icon: Users, label: 'Users' },
  { value: 'deleted', icon: Trash, label: 'Deleted' },
  { value: 'posts', icon: FileText, label: 'Posts' },
  { value: 'reels', icon: Clapperboard, label: 'Reels' },
  { value: 'books', icon: BookOpen, label: 'Books' },
  { value: 'reports', icon: Flag, label: 'Reports' },
  { value: 'ads', icon: Megaphone, label: 'Ads' },
  { value: 'verification', icon: BadgeCheck, label: 'Verify' },
  { value: 'settings', icon: Settings, label: 'Settings', staffOnly: true },
  { value: 'biometric', icon: ScanFace, label: 'Biometric', staffOnly: true },
  { value: 'security', icon: ShieldAlert, label: 'Security', superOnly: true },
  { value: 'audit', icon: ScrollText, label: 'Audit' },
];

export default function Admin() {
  const { user, isStaff, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<string>((location.state as { openTab?: string } | null)?.openTab ?? 'users');
  const [openReportCount, setOpenReportCount] = useState(0);
  const [pendingVerifyCount, setPendingVerifyCount] = useState(0);
  const [pendingAdsCount, setPendingAdsCount] = useState(0);
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
      const [{ count: reports }, { count: verif }, { count: ads }] = await Promise.all([
        supabase.from('reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
        supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('campaigns').select('*', { count: 'exact', head: true }).in('status', ['pending_review', 'pending_payment']),
      ]);
      if (mounted) {
        setOpenReportCount(reports ?? 0);
        setPendingVerifyCount(verif ?? 0);
        setPendingAdsCount(ads ?? 0);
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
      <div className="admin-scope container max-w-[1400px] px-4 py-6">
        <AdminControlCenter
          onNavigate={setActiveTab}
          openReportCount={openReportCount}
          pendingVerifyCount={pendingVerifyCount}
          onPurge={() => setPurgeOpen(true)}
          isSuperAdmin={!!isSuperAdmin}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="sticky top-16 z-20 flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border/70 bg-background/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
            {TABS.filter((t) => !((t.staffOnly && !isAdmin) || (t.superOnly && !isSuperAdmin))).map((t) => {
              const Icon = t.icon;
              const count = t.value === 'reports' ? openReportCount : t.value === 'verification' ? pendingVerifyCount : t.value === 'ads' ? pendingAdsCount : 0;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    'gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                    'data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm',
                    'hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {count > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="users">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="deleted">
            <AdminDeletedUsersTab />
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

          <TabsContent value="ads">
            <AdminAdsTab />
          </TabsContent>

          <TabsContent value="verification">
            <AdminVerificationTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings">
              <AdminSettingsTab />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="biometric">
              <AdminFaceAuthTab />
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="security">
              <RedButtonControl />
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
