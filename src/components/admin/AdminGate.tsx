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
  getStatus,
  revokeAllSessions,
  validateGrant,
  webauthnAuthOptions,
  webauthnAuthVerify,
  type StatusResponse,
} from '@/components/faceverification/verificationApi';
import { clearGrant, getGrant, grantTimeRemainingMs, setGrant } from '@/lib/security/adminFaceGrant';
import { arrayBufferToB64url, b64urlToArrayBuffer } from '@/lib/security/webauthnHelpers';
import type { FaceVerificationSuccess } from '@/components/faceverification/types';
import { KeyRound, Loader2, ShieldCheck, Lock } from 'lucide-react';
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
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pendingFaceGrant, setPendingFaceGrant] = useState<FaceVerificationSuccess | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');

  const lock = useCallback(() => {
    clearGrant();
    setGranted(false);
    setPendingFaceGrant(null);
    revokeAllSessions().catch(() => undefined);
  }, []);

  // Validate any existing in-memory grant against the server on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const statusResult = await getStatus();
      if (!cancelled && statusResult.ok && statusResult.data) setStatus(statusResult.data);
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
      if (status?.webauthnMode === 'required') {
        setPendingFaceGrant(result);
        return;
      }
      setGrant(result.grantToken, result.expiresIn, 'face');
      setGranted(true);
    }
  }, [status?.webauthnMode]);

  const authenticateWithPasskey = useCallback(async () => {
    if (!navigator.credentials?.get) {
      setPasskeyError('Passkeys are not supported by this browser or device.');
      return;
    }
    setPasskeyBusy(true);
    setPasskeyError('');
    try {
      const optionResult = await webauthnAuthOptions();
      const options = optionResult.data?.options;
      if (!optionResult.ok || !options || options.allowCredentials.length === 0) {
        throw new Error('No passkey is registered for this administrator.');
      }
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToArrayBuffer(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout ?? 120000,
          userVerification: 'required',
          allowCredentials: options.allowCredentials.map((item) => ({
            id: b64urlToArrayBuffer(item.id),
            type: item.type,
            transports: item.transports,
          })),
        },
      }) as PublicKeyCredential | null;
      if (!credential) return;
      const response = credential.response as AuthenticatorAssertionResponse;
      const verified = await webauthnAuthVerify({
        challengeId: options.challengeId,
        challenge: options.challenge,
        credentialId: credential.id,
        clientDataJSON: arrayBufferToB64url(response.clientDataJSON),
        authenticatorData: arrayBufferToB64url(response.authenticatorData),
        signature: arrayBufferToB64url(response.signature),
        faceGrantToken: pendingFaceGrant?.grantToken,
      });
      if (!verified.ok || !verified.data?.grantToken || !verified.data.expiresIn) {
        throw new Error(verified.message || 'Passkey verification failed.');
      }
      setGrant(verified.data.grantToken, verified.data.expiresIn, 'passkey');
      setPendingFaceGrant(null);
      setGranted(true);
    } catch (error) {
      const value = error as { name?: string; message?: string };
      if (value.name !== 'NotAllowedError' && value.name !== 'AbortError') {
        setPasskeyError(value.message || 'Passkey verification failed.');
      }
    } finally {
      setPasskeyBusy(false);
    }
  }, [pendingFaceGrant?.grantToken]);

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

  if (pendingFaceGrant) {
    return (
      <div className="container flex min-h-[70vh] max-w-lg items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Confirm with your passkey</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Face verification passed. Use your device PIN, fingerprint, or secure face unlock to finish.
          </p>
          {passkeyError && <p className="mt-3 text-sm text-destructive">{passkeyError}</p>}
          <Button className="mt-5 w-full" onClick={authenticateWithPasskey} disabled={passkeyBusy}>
            {passkeyBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Continue with passkey
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={lock}>Start over</Button>
        </div>
      </div>
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
      {status && status.webauthnMode !== 'disabled' && status.webauthnCount > 0 && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={authenticateWithPasskey} disabled={passkeyBusy}>
            {passkeyBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Use device passkey
          </Button>
          {passkeyError && <p className="mt-2 text-sm text-destructive">{passkeyError}</p>}
        </div>
      )}
    </div>
  );
}
