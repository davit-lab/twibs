// AdminFaceAuthTab — biometric enrollment, feature flag and session controls.
//
// Enrollment is super-admin-only and runs the same server-verified liveness
// pipeline as the gate, then stores a fresh face template. Passkey enrollment
// is a real FIDO2 registration against the edge function.

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Fingerprint, KeyRound, Loader2, ScanFace, ShieldCheck, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { supabase } from '@/integrations/supabase/client';
import AdminSection from './AdminSection';
import FaceVerification from '@/components/faceverification/FaceVerification';
import {
  getStatus,
  revokeAllSessions,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  type StatusResponse,
} from '@/components/faceverification/verificationApi';
import { arrayBufferToB64url, b64urlToArrayBuffer } from '@/lib/security/webauthnHelpers';
import { clearGrant } from '@/lib/security/adminFaceGrant';

interface RegisterOptions {
  challengeId?: string;
  challenge?: string;
  rp?: { id?: string; name?: string };
  user?: { id?: string; name?: string; displayName?: string };
  pubKeyCredParams?: Array<{ type: string; alg: number }>;
  excludeCredentials?: Array<{ id: string; type: string }>;
  authenticatorSelection?: Record<string, unknown>;
  timeout?: number;
  attestation?: string;
}

export default function AdminFaceAuthTab() {
  const { isSuperAdmin, user } = useAuth();
  const { refetch: refetchSettings } = useAppSettings();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await getStatus();
    if (res.ok && res.data) setStatus(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleEnabled = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        if (next && !status?.enrolled) {
          toast({
            variant: 'destructive',
            title: 'Enroll first',
            description: 'A face template must be enrolled before verification can be enabled.',
          });
          return;
        }
        const { error } = await (supabase as unknown as {
          rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }>;
        }).rpc('set_system_setting', {
          p_key: 'face_auth_enabled',
          p_value: next,
        });
        if (error) throw error;
        await refresh();
        await refetchSettings();
        toast({
          title: next ? 'Face verification enabled' : 'Face verification disabled',
          description: next
            ? 'The admin console now requires biometric verification.'
            : 'The admin console can be accessed without biometric verification.',
        });
      } catch (e: unknown) {
        toast({
          variant: 'destructive',
          title: 'Failed to update setting',
          description: e instanceof Error ? e.message : 'Something went wrong.',
        });
      } finally {
        setSaving(false);
      }
    },
    [status, refresh, refetchSettings],
  );

  const registerPasskey = useCallback(async () => {
    if (!navigator.credentials?.create) {
      toast({ variant: 'destructive', title: 'Passkeys unavailable', description: 'This browser does not support WebAuthn.' });
      return;
    }
    setPasskeyBusy(true);
    try {
      const res = await webauthnRegisterOptions();
      if (!res.ok || !res.data?.options) throw new Error(res.message || 'Failed to start passkey registration.');
      const o = res.data.options as RegisterOptions;

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: b64urlToArrayBuffer(o.challenge ?? ''),
          rp: { id: o.rp?.id ?? window.location.host, name: o.rp?.name ?? 'Twibsers Admin' },
          user: {
            id: b64urlToArrayBuffer(o.user?.id ?? ''),
            name: o.user?.name ?? user?.email ?? '',
            displayName: o.user?.displayName ?? user?.email ?? '',
          },
          pubKeyCredParams: (o.pubKeyCredParams ?? [{ type: 'public-key', alg: -7 }]) as PublicKeyCredentialParameters[],
          timeout: o.timeout ?? 120000,
          attestation: (o.attestation ?? 'none') as AttestationConveyancePreference,
          excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({
            ...c,
            id: b64urlToArrayBuffer(c.id),
          })) as PublicKeyCredentialDescriptor[],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        toast({ title: 'Passkey registration cancelled' });
        return;
      }
      const resp = credential.response as AuthenticatorAttestationResponse;
      const verify = await webauthnRegisterVerify({
        challengeId: o.challengeId ?? '',
        challenge: o.challenge ?? '',
        clientDataJSON: arrayBufferToB64url(resp.clientDataJSON),
        attestationObject: arrayBufferToB64url(resp.attestationObject),
      });
      if (!verify.ok) throw new Error(verify.message || 'Registration was rejected by the server.');
      await refresh();
      toast({ title: 'Passkey registered', description: 'Your platform authenticator is now a recovery factor.' });
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string } | null;
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        toast({ title: 'Passkey registration cancelled' });
      } else {
        toast({ variant: 'destructive', title: 'Passkey registration failed', description: err?.message || 'Something went wrong.' });
      }
    } finally {
      setPasskeyBusy(false);
    }
  }, [refresh, user?.email]);

  const lockAllSessions = useCallback(async () => {
    setSaving(true);
    try {
      await revokeAllSessions();
      clearGrant();
      toast({ title: 'All biometric sessions revoked' });
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <AdminSection
      icon={ScanFace}
      title="Administrator biometrics"
      eyebrow="Security"
      description="Face template, liveness and passkey settings for the admin console. The server is authoritative for every verification."
      actions={
        <Button variant="outline" size="sm" onClick={lockAllSessions} disabled={saving} className="gap-2">
          <Unlock className="h-4 w-4" />
          Revoke all sessions
        </Button>
      }
    >
      {loading || !status ? (
        <div className="py-14 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Face template */}
          <div className="rounded-2xl border border-border/60 bg-surface-2/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Face template</p>
                  <p className="text-sm text-muted-foreground">
                    {status.enrolled ? 'Enrolled' : 'Not enrolled'}
                  </p>
                </div>
              </div>
              {isSuperAdmin && (
                <Button onClick={() => setEnrollOpen(true)} disabled={!isSuperAdmin} className="gap-2">
                  <ScanFace className="h-4 w-4" />
                  {status.enrolled ? 'Re-enroll' : 'Enroll face'}
                </Button>
              )}
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono">{status.modelVersion ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Template updated</dt>
                <dd>{status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Threshold override</dt>
                <dd>{status.thresholdOverride ?? 'default (0.55)'}</dd>
              </div>
            </dl>

            {!isSuperAdmin && (
              <p className="mt-4 text-xs text-muted-foreground">
                Only a super administrator can enroll or replace the face template.
              </p>
            )}
          </div>

          {/* Feature flag + passkeys */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/60 bg-surface-2/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Require verification</p>
                    <p className="text-sm text-muted-foreground">Gates the admin console</p>
                  </div>
                </div>
                <Switch
                  checked={status.enabled}
                  disabled={saving || !isSuperAdmin}
                  onCheckedChange={toggleEnabled}
                  aria-label="Require face verification for the admin console"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                When enabled, staff must pass an active liveness check and a face match to open the
                admin console. Disabling is allowed only after a template is enrolled — see README.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-surface-2/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Passkey recovery factor</p>
                    <p className="text-sm text-muted-foreground">{status.webauthnCount} registered</p>
                  </div>
                </div>
                {isSuperAdmin && (
                  <Button variant="outline" onClick={registerPasskey} disabled={passkeyBusy} className="gap-2">
                    {passkeyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                    Register passkey
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                A FIDO2 platform authenticator used as a secondary / recovery factor (optional).
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="admin-scope max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" />
              Enroll your face
            </DialogTitle>
            <DialogDescription>
              You will be guided through a short liveness sequence. The template is stored on the
              server and never kept in this browser.
            </DialogDescription>
          </DialogHeader>
          <FaceVerification
            mode="enroll"
            onCancel={() => setEnrollOpen(false)}
            onSuccess={async () => {
              await refresh();
              await refetchSettings();
              setEnrollOpen(false);
              toast({ title: 'Face enrolled', description: 'Your biometric template is active.' });
            }}
          />
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
