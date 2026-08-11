// Thin typed client for the `admin-face-verify` edge function.
//
// The server is the authority for every verification decision; this module only
// transports the browser's camera-derived signals. Detailed failure reasons are
// intentionally NOT surfaced to the UI — callers see the same generic message
// the server already returns.

import { supabase } from '@/integrations/supabase/client';
import type {
  IssuedChallenge,
  LivenessProof,
  VerificationApiResult,
  VerificationPurpose,
  FaceVerificationSuccess,
} from './types';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://mroudkddozvlpcxedank.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yb3Vka2Rkb3p2bHBjeGVkYW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzAxODUsImV4cCI6MjA4NDUwNjE4NX0.K3x4REiM9Vaju-06eJcPlmLjy6AbkKvbxTtA77FidbQ';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-face-verify`;

interface ApiError {
  success?: false;
  code?: string;
  message?: string;
}

async function invoke<T>(action: string, body: Record<string, unknown>): Promise<VerificationApiResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...body }),
    });

    const json = (await res.json()) as (ApiError & { success?: true }) | Record<string, unknown>;
    if (json.success) {
      return { ok: true, data: json as T };
    }
    return {
      ok: false,
      code: (json as ApiError).code ?? 'generic_failure',
      message: (json as ApiError).message ?? 'Verification failed. Please try again.',
    };
  } catch {
    return { ok: false, code: 'network_error', message: 'Could not reach the verification service.' };
  }
}

export interface StatusResponse {
  enrolled: boolean;
  enabled: boolean;
  modelVersion: string | null;
  updatedAt: string | null;
  credentialAdminId: string | null;
  thresholdOverride: number | null;
  webauthnCount: number;
  webauthnMode: 'disabled' | 'optional' | 'required';
}

export function startChallenge(purpose: VerificationPurpose): Promise<VerificationApiResult<{ challenge: IssuedChallenge }>> {
  return invoke<{ challenge: IssuedChallenge }>('start', { purpose });
}

export function submitProof(
  purpose: VerificationPurpose,
  proof: LivenessProof,
  nonce: string,
  embedding: number[],
): Promise<VerificationApiResult<FaceVerificationSuccess>> {
  return invoke<FaceVerificationSuccess>(purpose === 'enroll' ? 'enroll' : 'verify', {
    challengeId: proof.challengeId,
    nonce,
    proof,
    embedding,
  });
}

export function getStatus(): Promise<VerificationApiResult<StatusResponse>> {
  return invoke<StatusResponse>('status', {});
}

export function validateGrant(grantToken: string): Promise<VerificationApiResult<{ valid: boolean; expiresIn: number; sub: string }>> {
  return invoke<{ valid: boolean; expiresIn: number; sub: string }>('validate-grant', { grantToken });
}

export function revokeGrantToken(grantToken: string): Promise<VerificationApiResult<{ revoked: boolean }>> {
  return invoke<{ revoked: boolean }>('revoke', { grantToken });
}

export function revokeAllSessions(): Promise<VerificationApiResult<{ revoked: boolean }>> {
  return invoke<{ revoked: boolean }>('revoke', {});
}

export function webauthnRegisterOptions(): Promise<VerificationApiResult<{ options: Record<string, unknown> }>> {
  return invoke<{ options: Record<string, unknown> }>('webauthn-register-options', {});
}

export function webauthnRegisterVerify(payload: {
  challengeId: string;
  challenge: string;
  clientDataJSON: string;
  attestationObject: string;
}): Promise<VerificationApiResult<{ registered: boolean }>> {
  return invoke<{ registered: boolean }>('webauthn-register-verify', payload);
}
