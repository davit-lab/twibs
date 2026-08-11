// Authentication / session service.
//
// On successful verification the server issues a short-lived, signed grant
// (JWT, HS256, BIOMETRIC_JWT_SECRET). The client holds it ONLY in memory.
// The server also records a matching row in admin_face_sessions keyed by the
// grant's jti, which allows server-side revocation even though the token is
// never persisted on the client.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type GrantClaims,
  randomBytes,
  sha256Hex,
  signGrantJwt,
  toB64Url,
  verifyGrantJwt,
} from "./crypto.ts";
import { challengeConfig } from "./challengeService.ts";

export interface GrantResult {
  token: string;
  expiresIn: number;
  expiresAt: string;
}

export async function issueGrant(
  supabase: SupabaseClient,
  params: {
    adminId: string;
    challengeId: string | null;
    factor: "face" | "passkey";
  },
): Promise<GrantResult> {
  const config = challengeConfig();
  const secret = Deno.env.get("BIOMETRIC_JWT_SECRET") || "";
  if (!secret) throw new Error("BIOMETRIC_JWT_SECRET not configured");

  const expiresIn = config.grantTtlSeconds;
  const now = Math.floor(Date.now() / 1000);

  // Create the revocable session row first; its id becomes the token jti.
  const grantTokenId = toB64Url(randomBytes(16));
  const { data, error } = await supabase
    .from("admin_face_sessions")
    .insert({
      admin_id: params.adminId,
      challenge_id: params.challengeId,
      grant_token_hash: await sha256Hex(grantTokenId),
      factor: params.factor,
      expires_at: new Date((now + expiresIn) * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("Failed to create admin session");

  const claims: GrantClaims = {
    sub: params.adminId,
    purpose: "admin-face-grant",
    factor: params.factor,
    jti: data.id,
    iat: now,
    exp: now + expiresIn,
  };
  // Bind the session row hash to the JWT's jti so a token cannot be moved
  // onto another session row.
  const token = await signGrantJwt(claims, secret);

  return {
    token,
    expiresIn,
    expiresAt: new Date((now + expiresIn) * 1000).toISOString(),
  };
}

export async function validateGrant(
  supabase: SupabaseClient,
  token: string,
): Promise<{ ok: boolean; claims?: GrantClaims }> {
  const secret = Deno.env.get("BIOMETRIC_JWT_SECRET") || "";
  if (!secret) return { ok: false };

  const claims = await verifyGrantJwt(token, secret);
  if (!claims) return { ok: false };

  const { data } = await supabase
    .from("admin_face_sessions")
    .select("id, revoked_at, expires_at")
    .eq("id", claims.jti)
    .maybeSingle();
  if (!data) return { ok: false };
  if (data.revoked_at) return { ok: false };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false };

  return { ok: true, claims };
}

export async function revokeGrant(supabase: SupabaseClient, token: string): Promise<void> {
  const secret = Deno.env.get("BIOMETRIC_JWT_SECRET") || "";
  const claims = await verifyGrantJwt(token, secret);
  if (!claims) return;
  await supabase.from("admin_face_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", claims.jti);
}

export async function revokeAllForAdmin(supabase: SupabaseClient, adminId: string): Promise<void> {
  await supabase
    .from("admin_face_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_id", adminId)
    .is("revoked_at", null);
}
