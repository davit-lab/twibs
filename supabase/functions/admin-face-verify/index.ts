// ============================================================================
// admin-face-verify — server-side administrator biometric verification.
//
// All verification decisions that matter (liveness proof structure, one-time
// challenge validity, face-embedding match, rate limits, grant issuance) are
// made HERE, in the server. The browser performs the computer-vision pipeline
// and submits raw metrics + an embedding; the server is authoritative.
//
// Actions:
//   start                    – issue a randomized, one-time liveness challenge
//   verify                   – validate proof + embedding, issue grant on match
//   enroll-start / enroll    – secure administrator biometric enrollment
//   status                   – enrollment / feature status (staff only)
//   validate-grant           – is a grant token still valid?
//   revoke                   – revoke a grant immediately
//   webauthn-register-options/verify, webauthn-auth-options/verify
//                            – FIDO2 passkey enrollment & assertion
//   cleanup                  – maintenance sweep of stale rows
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  challengeConfig,
  issueChallenge,
  loadChallenge,
  updateChallengeStatus,
} from "./_shared/challengeService.ts";
import { validateLivenessProof, type LivenessProof } from "./_shared/livenessService.ts";
import {
  cosineSimilarity,
  embeddingIsPlausible,
  loadCredential,
  storeCredential,
  DEFAULT_MODEL_VERSION,
} from "./_shared/biometricService.ts";
import {
  issueGrant,
  revokeGrant,
  validateGrant,
  revokeAllForAdmin,
} from "./_shared/authenticationService.ts";
import { sendAdminLoginNotification } from "./_shared/emailService.ts";
import { recentAttemptCount, writeAdminAudit, writeSecurityEvent } from "./_shared/auditService.ts";
import {
  resolveConfig,
  verifyAuthentication,
  verifyRegistration,
  webauthnAuthOptions,
  webauthnRegisterOptions,
} from "./_shared/webauthnService.ts";
import { sha256Hex } from "./_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Json): Response {
  return json({ success: true, ...body });
}

function fail(code: string, message: string, status = 200): Response {
  return json({ success: false, code, message }, status);
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

/** Resolve the authenticated staff user from the request, if any. */
async function authUser(
  req: Request,
): Promise<{ id: string; email: string | null; displayName: string | null; isSuperAdmin: boolean; isStaff: boolean } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) return null;

  const { data: roles } = await getSupabaseAdmin()
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  const set = new Set((roles || []).map((r: { role: string }) => r.role));
  const isSuperAdmin = set.has("super_admin");
  const isStaff = isSuperAdmin || set.has("admin") || set.has("moderator") || set.has("support");
  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("display_name")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    displayName: (profile as { display_name?: string } | null)?.display_name ?? null,
    isSuperAdmin,
    isStaff,
  };
}

async function requireStaff(req: Request): Promise<ReturnType<typeof authUser>> {
  const user = await authUser(req);
  if (!user || !user.isStaff) throw new AuthError("not authorized");
  return user;
}

class AuthError extends Error {}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleStart(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  const purpose = body.purpose === "enroll" ? "enroll" : "verify";
  const supabase = getSupabaseAdmin();
  const config = challengeConfig();
  const ipHash = await hashIp(clientIp(req));

  // Simple rate limit on challenge issuance per IP.
  const issued = await recentAttemptCount(supabase, ipHash, config.rateLimitWindowSeconds, ["face_challenge_issued"]);
  if (issued >= config.rateLimitAttempts) {
    return fail("too_many_attempts", "Too many attempts. Try again later.", 429);
  }

  const challenge = await issueChallenge(supabase, {
    purpose,
    ipHash,
    userAgent: req.headers.get("user-agent"),
    adminId: user.id,
  });
  await writeSecurityEvent(supabase, {
    eventType: "face_challenge_issued",
    success: true,
    userId: user.id,
    ipHash,
    metadata: { purpose },
  });

  return ok({ challenge });
}

async function handleVerify(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  const supabase = getSupabaseAdmin();
  const config = challengeConfig();
  const ipHash = await hashIp(clientIp(req));
  const userAgent = req.headers.get("user-agent");

  const challengeId = String(body.challengeId ?? "");
  const nonce = String(body.nonce ?? "");
  const proof = body.proof as LivenessProof;
  const embedding = body.embedding as unknown;

  if (!challengeId || !nonce || !proof || !Array.isArray(proof.frames)) {
    return fail("invalid_input", "Verification failed. Please try again.");
  }

  const challenge = await loadChallenge(supabase, challengeId);
  if (!challenge || challenge.purpose !== "verify") {
    return fail("generic_failure", "Verification failed. Please try again.");
  }
  if (challenge.status !== "pending") {
    return fail("generic_failure", "This verification session has already been used.");
  }
  if (challenge.created_by !== user.id) {
    return fail("generic_failure", "Verification failed. Please try again.");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await updateChallengeStatus(supabase, challengeId, { status: "expired" });
    return fail("challenge_expired", "The verification session expired. Please try again.");
  }
  if ((await sha256Hex(nonce)) !== challenge.challenge_hash) {
    return fail("generic_failure", "Verification failed. Please try again.");
  }

  // Server-side attempt & IP rate limiting.
  const attempts = await recentAttemptCount(supabase, ipHash, config.rateLimitWindowSeconds, ["face_auth_attempt"]);
  if (attempts >= config.rateLimitAttempts) {
    await writeSecurityEvent(supabase, {
      eventType: "face_auth_rate_limited",
      success: false,
      ipHash,
      userAgent,
      metadata: { challengeId },
    });
    return fail("too_many_attempts", "Too many attempts. Try again later.", 429);
  }

  // --- Liveness proof is re-validated server-side. -------------------------
  const verdict = validateLivenessProof(challenge, proof);
  if (!verdict.ok) {
    await recordFailedAttempt(supabase, challenge, challengeId, ipHash, userAgent, config.maxAttempts, verdict.reason ?? "unknown");
    return fail("generic_failure", "Verification failed. Please try again.");
  }

  // --- Identity: embedding must match the enrolled administrator. ---------
  if (!embeddingIsPlausible(embedding)) {
    await recordFailedAttempt(supabase, challenge, challengeId, ipHash, userAgent, config.maxAttempts, "invalid embedding");
    return fail("generic_failure", "Verification failed. Please try again.");
  }

  const credential = await loadCredential(supabase);
  if (!credential || !credential.enabled) {
    await writeSecurityEvent(supabase, {
      eventType: "face_auth_not_configured",
      success: false,
      ipHash,
      userAgent,
      metadata: { challengeId },
    });
    return fail("not_configured", "Face verification is not configured for this account.");
  }

  const score = cosineSimilarity(credential.template, embedding as number[]);
  const threshold = credential.threshold_override ?? config.threshold;
  if (score < threshold) {
    await recordFailedAttempt(supabase, challenge, challengeId, ipHash, userAgent, config.maxAttempts, "identity mismatch");
    return fail("generic_failure", "Verification failed. Please try again.");
  }

  // --- Success -------------------------------------------------------------
  await updateChallengeStatus(supabase, challengeId, {
    status: "completed",
    used_at: new Date().toISOString(),
    attempt_count: challenge.attempt_count + 1,
  });

  const grant = await issueGrant(supabase, {
    adminId: credential.admin_id,
    challengeId,
    factor: "face",
  });

  await writeSecurityEvent(supabase, {
    eventType: "face_auth_success",
    success: true,
    userId: credential.admin_id,
    ipHash,
    userAgent,
    metadata: { challengeId, similarity: round4(score), threshold },
  });
  await writeAdminAudit(supabase, {
    action: "admin_face_verify_success",
    targetType: "admin",
    targetId: credential.admin_id,
    details: { method: "face", factor: "face" },
  });

  // Notify the configured security mailbox (server-side, no secrets in client).
  try {
    await sendAdminLoginNotification({
      success: true,
      method: "Face liveness + biometric verification",
      ip: clientIp(req),
      userAgent: userAgent ?? "unknown",
    });
  } catch (e) {
    console.error("[admin-face-verify] email failed:", e);
  }

  return ok({ grantToken: grant.token, expiresIn: grant.expiresIn, expiresAt: grant.expiresAt });
}

async function recordFailedAttempt(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  challenge: { attempt_count: number },
  challengeId: string,
  ipHash: string,
  userAgent: string | null,
  maxAttempts: number,
  detail: string,
): Promise<void> {
  const next = challenge.attempt_count + 1;
  const blocked = next >= maxAttempts;
  await updateChallengeStatus(supabase, challengeId, {
    status: blocked ? "blocked" : "failed",
    attempt_count: next,
  });
  await writeSecurityEvent(supabase, {
    eventType: blocked ? "face_auth_blocked" : "face_auth_fail",
    success: false,
    ipHash,
    userAgent,
    metadata: { challengeId, attempt: next, detail },
  });

  // Alert on hard lockout only, to avoid flooding the inbox during a brute force.
  if (blocked) {
    try {
      await sendAdminLoginNotification({
        success: false,
        method: "Face liveness + biometric verification",
        ip: ipHash,
        userAgent: userAgent ?? "unknown",
      });
    } catch {
      /* email is best-effort */
    }
  }
}

async function handleEnrollStart(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  if (!user.isSuperAdmin) return fail("not_authorized", "Only super admins can enroll.", 403);

  const supabase = getSupabaseAdmin();
  const ipHash = await hashIp(clientIp(req));
  const config = challengeConfig();
  const issued = await recentAttemptCount(supabase, ipHash, config.rateLimitWindowSeconds, ["face_enroll_challenge_issued"]);
  if (issued >= config.rateLimitAttempts) {
    return fail("too_many_attempts", "Too many attempts. Try again later.", 429);
  }

  const challenge = await issueChallenge(supabase, {
    purpose: "enroll",
    ipHash,
    userAgent: req.headers.get("user-agent"),
    adminId: user.id,
  });
  await writeSecurityEvent(supabase, {
    eventType: "face_enroll_challenge_issued",
    success: true,
    userId: user.id,
    ipHash,
  });
  return ok({ challenge });
}

async function handleEnroll(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  if (!user.isSuperAdmin) return fail("not_authorized", "Only super admins can enroll.", 403);

  const supabase = getSupabaseAdmin();
  const ipHash = await hashIp(clientIp(req));
  const userAgent = req.headers.get("user-agent");
  const challengeId = String(body.challengeId ?? "");
  const nonce = String(body.nonce ?? "");
  const proof = body.proof as LivenessProof;
  const embedding = body.embedding as unknown;

  if (!challengeId || !nonce || !proof || !Array.isArray(proof.frames)) {
    return fail("invalid_input", "Enrollment failed. Please try again.");
  }

  const challenge = await loadChallenge(supabase, challengeId);
  if (
    !challenge ||
    challenge.purpose !== "enroll" ||
    challenge.created_by !== user.id ||
    challenge.status !== "pending"
  ) {
    return fail("generic_failure", "Enrollment failed. Please try again.");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return fail("challenge_expired", "The enrollment session expired. Please try again.");
  }
  if ((await sha256Hex(nonce)) !== challenge.challenge_hash) {
    return fail("generic_failure", "Enrollment failed. Please try again.");
  }

  const verdict = validateLivenessProof(challenge, proof);
  if (!verdict.ok) {
    await writeSecurityEvent(supabase, {
      eventType: "face_enroll_fail",
      success: false,
      userId: user.id,
      ipHash,
      userAgent,
      metadata: { challengeId, reason: verdict.reason ?? "unknown" },
    });
    return fail("generic_failure", "Liveness check failed. Please try again.");
  }

  if (!embeddingIsPlausible(embedding)) {
    await writeSecurityEvent(supabase, {
      eventType: "face_enroll_fail",
      success: false,
      userId: user.id,
      ipHash,
      userAgent,
      metadata: { challengeId, reason: "invalid embedding" },
    });
    return fail("generic_failure", "Enrollment failed. Please try again.");
  }

  await storeCredential(supabase, user.id, embedding as number[], DEFAULT_MODEL_VERSION);
  await updateChallengeStatus(supabase, challengeId, {
    status: "completed",
    used_at: new Date().toISOString(),
    attempt_count: challenge.attempt_count + 1,
  });
  await writeSecurityEvent(supabase, {
    eventType: "face_enroll_success",
    success: true,
    userId: user.id,
    ipHash,
    userAgent,
    metadata: { challengeId },
  });
  await writeAdminAudit(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    action: "admin_biometric_enrolled",
    targetType: "admin",
    targetId: user.id,
    details: { modelVersion: DEFAULT_MODEL_VERSION },
  });
  try {
    await sendAdminLoginNotification({
      success: true,
      method: "Biometric enrollment (new face template registered)",
      ip: clientIp(req),
      userAgent: userAgent ?? "unknown",
    });
  } catch {
    /* best-effort */
  }

  return ok({ enrolled: true });
}

async function handleStatus(req: Request): Promise<Response> {
  const user = await requireStaff(req);
  const supabase = getSupabaseAdmin();

  const credential = await loadCredential(supabase);
  const { data: settings } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "face_auth_enabled")
    .maybeSingle();
  const { count: webauthnCount } = await supabase
    .from("admin_webauthn_credentials")
    .select("*", { count: "exact", head: true })
    .eq("admin_id", user.id);

  const webauthnMode = Deno.env.get("WEBAUTHN_MODE") ?? "optional";
  return ok({
    enrolled: !!credential,
    enabled: (settings as { value?: boolean } | null)?.value === true,
    modelVersion: credential?.model_version ?? null,
    updatedAt: credential?.updated_at ?? null,
    credentialAdminId: credential?.admin_id ?? null,
    thresholdOverride: credential?.threshold_override ?? null,
    webauthnCount: webauthnCount ?? 0,
    webauthnMode: webauthnMode === "disabled" ? "disabled" : webauthnMode,
  });
}

async function handleValidateGrant(body: Json): Promise<Response> {
  const token = String(body.grantToken ?? "");
  if (!token) return fail("invalid_input", "Missing grant token.");
  const supabase = getSupabaseAdmin();
  const { ok: valid, claims } = await validateGrant(supabase, token);
  if (!valid) return fail("invalid_grant", "This session is no longer valid.");
  const remaining = Math.max(0, (claims!.exp * 1000 - Date.now()) / 1000);
  return ok({ valid: true, expiresIn: Math.floor(remaining), sub: claims!.sub, factor: claims!.factor });
}

async function handleRevoke(body: Json, req: Request): Promise<Response> {
  const token = String(body.grantToken ?? "");
  const user = await requireStaff(req);
  const supabase = getSupabaseAdmin();
  if (token) {
    await revokeGrant(supabase, token);
  } else {
    // Revoke everything for the current admin (session reset).
    await revokeAllForAdmin(supabase, user.id);
  }
  await writeSecurityEvent(supabase, {
    eventType: "admin_grant_revoked",
    success: true,
    userId: user.id,
    ipHash: await hashIp(clientIp(req)),
  });
  return ok({ revoked: true });
}

async function handleWebAuthnRegisterOptions(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  if (!user.isSuperAdmin) return fail("not_authorized", "Only super admins can manage passkeys.", 403);
  const supabase = getSupabaseAdmin();
  const cfg = resolveConfig(req.headers.get("origin") || new URL(req.url).origin);
  const options = await webauthnRegisterOptions(supabase, cfg, {
    id: user.id,
    email: user.email ?? user.id,
    displayName: user.displayName ?? "",
  });
  return ok({ options });
}

async function handleWebAuthnRegisterVerify(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  if (!user.isSuperAdmin) return fail("not_authorized", "Only super admins can manage passkeys.", 403);
  const supabase = getSupabaseAdmin();
  const cfg = resolveConfig(req.headers.get("origin") || new URL(req.url).origin);
  const result = await verifyRegistration(supabase, cfg, {
    challengeId: String(body.challengeId ?? ""),
    challenge: String(body.challenge ?? ""),
    clientDataJSON: String(body.clientDataJSON ?? ""),
    attestationObject: String(body.attestationObject ?? ""),
  });
  await writeSecurityEvent(supabase, {
    eventType: "webauthn_registered",
    success: true,
    userId: user.id,
    ipHash: await hashIp(clientIp(req)),
    metadata: { aaguid: result.aaguid },
  });
  await writeAdminAudit(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    action: "admin_webauthn_registered",
    targetType: "admin",
    targetId: user.id,
    details: { aaguid: result.aaguid },
  });
  return ok({ registered: true });
}

async function handleWebAuthnAuthOptions(req: Request): Promise<Response> {
  const user = await requireStaff(req);
  const supabase = getSupabaseAdmin();
  const cfg = resolveConfig(req.headers.get("origin") || new URL(req.url).origin);
  const options = await webauthnAuthOptions(supabase, cfg, user.id);
  return ok({ options });
}

async function handleWebAuthnAuthVerify(body: Json, req: Request): Promise<Response> {
  const user = await requireStaff(req);
  const supabase = getSupabaseAdmin();
  const cfg = resolveConfig(req.headers.get("origin") || new URL(req.url).origin);
  const result = await verifyAuthentication(supabase, cfg, {
    challengeId: String(body.challengeId ?? ""),
    challenge: String(body.challenge ?? ""),
    credentialId: String(body.credentialId ?? ""),
    clientDataJSON: String(body.clientDataJSON ?? ""),
    authenticatorData: String(body.authenticatorData ?? ""),
    signature: String(body.signature ?? ""),
  });
  const grant = await issueGrant(supabase, {
    adminId: result.adminId,
    challengeId: body.challengeId ? String(body.challengeId) : null,
    factor: "passkey",
  });
  await writeSecurityEvent(supabase, {
    eventType: "webauthn_success",
    success: true,
    userId: result.adminId,
    ipHash: await hashIp(clientIp(req)),
    userAgent: req.headers.get("user-agent"),
  });
  await writeAdminAudit(supabase, {
    action: "admin_webauthn_verify_success",
    targetType: "admin",
    targetId: result.adminId,
    details: { method: "passkey" },
  });
  try {
    await sendAdminLoginNotification({
      success: true,
      method: "Passkey (WebAuthn)",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? "unknown",
    });
  } catch {
    /* best-effort */
  }
  return ok({ grantToken: grant.token, expiresIn: grant.expiresIn, expiresAt: grant.expiresAt });
}

async function handleCleanup(req: Request): Promise<Response> {
  await requireStaff(req);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("cleanup_face_security");
  if (error) return fail("cleanup_failed", error.message, 500);
  return ok({ cleaned: data ?? 0 });
}

// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function hashIp(ip: string): Promise<string> {
  return sha256Hex(ip);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (req.method !== "POST") return fail("method_not_allowed", "POST only", 405);

    const body = (await req.json()) as Json;
    const action = String(body.action ?? (path === "admin-face-verify" ? "" : path));

    switch (action) {
      case "start":
        return await handleStart(body, req);
      case "verify":
        return await handleVerify(body, req);
      case "enroll-start":
        return await handleEnrollStart(body, req);
      case "enroll":
        return await handleEnroll(body, req);
      case "status":
        return await handleStatus(req);
      case "validate-grant":
        return await handleValidateGrant(body);
      case "revoke":
        return await handleRevoke(body, req);
      case "webauthn-register-options":
        return await handleWebAuthnRegisterOptions(body, req);
      case "webauthn-register-verify":
        return await handleWebAuthnRegisterVerify(body, req);
      case "webauthn-auth-options":
        return await handleWebAuthnAuthOptions(req);
      case "webauthn-auth-verify":
        return await handleWebAuthnAuthVerify(body, req);
      case "cleanup":
        return await handleCleanup(req);
      default:
        return fail("unknown_action", "Unknown action", 404);
    }
  } catch (e) {
    if (e instanceof AuthError) return fail("not_authorized", e.message, 401);
    console.error("[admin-face-verify] error:", e);
    return fail("internal_error", "Verification failed. Please try again.", 500);
  }
});
