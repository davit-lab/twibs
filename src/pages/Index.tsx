import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Landing from '@/components/landing/Landing';
import { Loader2 } from 'lucide-react';

const AuthenticatedHome = lazy(() => import('@/components/feed/AuthenticatedHome'));

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  if (user) {
    return <Suspense fallback={<LoadingScreen />}><AuthenticatedHome /></Suspense>;
  }

  return <Landing />;
}
