// AdminGate — the enforcement point for administrator biometric verification.
//
// When `face_auth_enabled` is on, the admin console is only reachable after a
// successful server-verified liveness + face match (or an active, unexpired
// in-memory grant). When the flag is off, staff can still reach the panel so a
// super admin can enroll a template (see README: never enable the flag before
// enrollment exists — otherwise you lock out the panel).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import FaceVerification from '@/components/faceverification/FaceVerification';
import {
  revokeAllSessions,
  validateGrant,
} from '@/components/faceverification/verificationApi';
import { clearGrant, getGrant, grantTimeRemainingMs, setGrant } from '@/lib/security/adminFaceGrant';
import type { FaceVerificationSuccess } from '@/components/faceverification/types';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

const AdminGateContext = createContext<{ lock: () => void }>({ lock: () => undefined });

export function useAdminGate() {
  return useContext(AdminGateContext);
}

interface AdminGateProps {
  children: ReactNode;
}

export default function AdminGate({ children }: AdminGateProps) {
  const { user } = useAuth();
  const { isEnabled, isLoading } = useAppSettings();
  const [checking, setChecking] = useState(true);
  const [granted, setGranted] = useState(false);

  const lock = useCallback(() => {
    clearGrant();
    setGranted(false);
    revokeAllSessions().catch(() => undefined);
  }, []);

  // Validate any existing in-memory grant against the server on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const current = getGrant();
      if (current) {
        const res = await validateGrant(current.token);
        if (!cancelled) {
          if (res.ok && res.data?.valid) {
            setGranted(true);
          } else {
            clearGrant();
          }
        }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Drop the grant the moment it expires server-side.
  useEffect(() => {
    if (!granted) return;
    const id = setInterval(() => {
      if (grantTimeRemainingMs() <= 0) {
        clearGrant();
        setGranted(false);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [granted]);

  const handleSuccess = useCallback((result: FaceVerificationSuccess) => {
    if (result.grantToken && result.expiresIn) {
      setGrant(result.grantToken, result.expiresIn, 'face');
      setGranted(true);
    }
  }, []);

  if (isLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isEnabled('face_auth_enabled')) {
    // Bootstrap path: while the flag is off, the panel stays reachable so a
    // super administrator can enroll a template. Enforcement is strict ONLY
    // once the flag is enabled (see README: enable it after enrollment).
    return (
      <AdminGateContext.Provider value={{ lock }}>
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-700 dark:text-amber-300">
          <strong>Biometric verification is disabled.</strong> The admin console is currently NOT
          protected by face verification — a super administrator should enroll a template and
          enable <span className="font-mono">face_auth_enabled</span>.
        </div>
        {children}
      </AdminGateContext.Provider>
    );
  }

  if (granted) {
    return (
      <AdminGateContext.Provider value={{ lock }}>
        <div className="relative">
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Biometric session active · {Math.ceil(grantTimeRemainingMs() / 60000)}m left
            </span>
            <Button variant="ghost" size="sm" onClick={lock} className="gap-1.5 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Lock session
            </Button>
          </div>
          {children}
        </div>
      </AdminGateContext.Provider>
    );
  }

  return (
    <div className="container max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Verify your identity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The admin console is protected by active liveness and biometric face matching.
          Please complete the on-screen checks to continue.
        </p>
      </div>
      <FaceVerification mode="verify" onSuccess={handleSuccess} />
    </div>
  );
}
