import { lazy, Suspense, Component, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SystemSettingsProvider, useAppSettings } from '@/contexts/SystemSettingsContext';
import GlobalCallProvider from '@/components/calling/GlobalCallProvider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, Wrench } from 'lucide-react';

const Index = lazy(() => import('./pages/Index'));
const Auth = lazy(() => import('./pages/Auth'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Explore = lazy(() => import('./pages/Explore'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Library = lazy(() => import('./pages/Library'));
const LibraryItemDetail = lazy(() => import('./pages/LibraryItemDetail'));
const BookDetail = lazy(() => import('./pages/BookDetail'));
const BookEditor = lazy(() => import('./pages/BookEditor'));
const ChapterReader = lazy(() => import('./pages/ChapterReader'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminGate = lazy(() => import('./components/admin/AdminGate'));
const Reels = lazy(() => import('./pages/Reels'));
const OnboardingInterests = lazy(() => import('./pages/OnboardingInterests'));
const TvChannels = lazy(() => import('./pages/TvChannels'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PostShare = lazy(() => import('./pages/PostShare'));
const Interests = lazy(() => import('./pages/Interests'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <div className="max-w-md w-full text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                <span className="text-3xl">!</span>
              </div>
              <h2 className="text-xl font-bold">Something went wrong</h2>
              <p className="text-muted-foreground text-sm">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Go Home
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin, isModerator } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isModerator) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function MaintenanceScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Wrench className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Twibsers is under maintenance</h2>
        <p className="text-muted-foreground text-sm">
          We're making some improvements. Please check back shortly.
        </p>
      </div>
    </div>
  );
}

function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, loading, isStaff } = useAuth();
  const { isEnabled, isLoading } = useAppSettings();
  const location = useLocation();

  if (loading || isLoading) return <PageLoader />;
  // Staff (and the auth page, so a logged-out staff member can sign back in) bypass maintenance.
  if (isEnabled('maintenance_mode') && !isStaff && location.pathname !== '/auth') {
    return <MaintenanceScreen />;
  }
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SystemSettingsProvider>
              <GlobalCallProvider />
              <Suspense fallback={<PageLoader />}>
                <MaintenanceGate>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/profile/:username" element={<Profile />} />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/interests" element={<Interests />} />
                    <Route
                      path="/messages"
                      element={
                        <ProtectedRoute>
                          <Messages />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <ProtectedRoute>
                          <Notifications />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/library" element={<Library />} />
                    <Route path="/library/item/:itemId" element={<LibraryItemDetail />} />
                    <Route path="/library/book/:bookId" element={<BookDetail />} />
                    <Route
                      path="/library/book/:bookId/edit"
                      element={
                        <ProtectedRoute>
                          <BookEditor />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/library/book/:bookId/read/:chapterId" element={<ChapterReader />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminRoute>
                          <AdminGate>
                            <Admin />
                          </AdminGate>
                        </AdminRoute>
                      }
                    />
                    <Route path="/tv" element={<TvChannels />} />
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/groups/:slug" element={<GroupDetail />} />
                    <Route path="/reels" element={<Reels />} />
                    <Route path="/post/:postId" element={<PostShare />} />
                    <Route
                      path="/onboarding/interests"
                      element={
                        <ProtectedRoute>
                          <OnboardingInterests />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </MaintenanceGate>
              </Suspense>
            </SystemSettingsProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
