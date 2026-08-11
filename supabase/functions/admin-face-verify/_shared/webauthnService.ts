// WebAuthn / passkey support — a real FIDO2 Relying Party implementation.
//
// The Edge Function acts as the relying party: it issues challenges, parses
// authenticator attestation objects and assertions, verifies ECDSA (P-256)
// signatures over the authenticated-data || client-data hash, and stores only
// the public key + credential id in the database (never the private key).
//
// This is a secondary / recovery factor layered on top of the existing
// Supabase login and (optionally) face verification. WEBAUTHN_MODE:
//   disabled  – passkeys unavailable
//   optional  – passkeys used when one is enrolled
//   required  – passkeys mandatory for the admin console

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode } from "https://esm.sh/cbor-x@1.5.4";
import { fromB64Url, randomBytes, sha256Hex, toB64Url, toHex } from "./crypto.ts";

export interface WebAuthnConfig {
  rpId: string;
  origin: string;
  rpName: string;
}

export function resolveConfig(requestOrigin: string): WebAuthnConfig {
  const origin = Deno.env.get("WEBAUTHN_ORIGIN") || requestOrigin;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    host = origin.replace(/^https?:\/\//, "");
  }
  return {
    origin,
    rpId: Deno.env.get("WEBAUTHN_RP_ID") || host,
    rpName: Deno.env.get("WEBAUTHN_RP_NAME") || "Twibsers Admin",
  };
}

interface StoredChallenge {
  id: string;
  challenge_hash: string;
  expires_at: string;
  status: string;
  purpose: string;
  created_by: string | null;
}

async function issueWebAuthnChallenge(
  supabase: SupabaseClient,
  purpose: "webauthn_register" | "webauthn_auth",
  userId: string | null,
): Promise<{ challengeId: string; challenge: string }> {
  const challenge = toB64Url(randomBytes(32));
  const hash = await sha256Hex(challenge);
  const { data, error } = await supabase
    .from("verification_challenges")
    .insert({
      purpose,
      challenge_hash: hash,
      sequence: JSON.stringify([]),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Failed to issue webauthn challenge");
  return { challengeId: data.id, challenge };
}

async function loadWebAuthnChallenge(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<StoredChallenge | null> {
  const { data } = await supabase
    .from("verification_challenges")
    .select("id, challenge_hash, expires_at, status, purpose, created_by")
    .eq("id", challengeId)
    .maybeSingle();
  return (data as StoredChallenge | null) ?? null;
}

async function consumeWebAuthnChallenge(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<void> {
  await supabase
    .from("verification_challenges")
    .update({ status: "completed", used_at: new Date().toISOString() })
    .eq("id", challengeId);
}

// ---- Registration ---------------------------------------------------------

export async function webauthnRegisterOptions(
  supabase: SupabaseClient,
  cfg: WebAuthnConfig,
  user: { id: string; email: string; displayName: string },
): Promise<Record<string, unknown>> {
  const { challengeId, challenge } = await issueWebAuthnChallenge(supabase, "webauthn_register", user.id);

  const { data: existing } = await supabase
    .from("admin_webauthn_credentials")
    .select("credential_id")
    .eq("admin_id", user.id);

  return {
    challengeId,
    rp: { id: cfg.rpId, name: cfg.rpName },
    user: {
      id: toB64Url(new TextEncoder().encode(user.id)),
      name: user.email,
      displayName: user.displayName || user.email,
    },
    challenge,
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 120_000,
    attestation: "none",
    excludeCredentials: (existing || []).map((c: { credential_id: string }) => ({
      id: c.credential_id,
      type: "public-key",
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  };
}

function parseAuthData(authData: Uint8Array) {
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
  let credId: Uint8Array | null = null;
  let aaguidHex = "";
  let coseKey: Map<unknown, unknown> | null = null;
  const attested = (flags & 0x40) !== 0;
  if (attested) {
    aaguidHex = toHex(authData.slice(37, 53));
    const credIdLen = (authData[53] << 8) | authData[54];
    credId = authData.slice(55, 55 + credIdLen);
    coseKey = decode(authData.slice(55 + credIdLen)) as Map<unknown, unknown>;
  }
  return { rpIdHash, flags, signCount, credId, aaguidHex, coseKey };
}

/** Extract the raw EC point (0x04 || x || y) from a COSE public key. */
function coseKeyToRawPoint(coseKey: Map<unknown, unknown>): Uint8Array | null {
  if (!(coseKey instanceof Map)) return null;
  const x = coseKey.get(-2) as Uint8Array | undefined;
  const y = coseKey.get(-3) as Uint8Array | undefined;
  if (!x || !y || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) return null;
  const point = new Uint8Array(1 + x.length + y.length);
  point[0] = 0x04;
  point.set(x, 1);
  point.set(y, 1 + x.length);
  return point;
}

export interface RegisterVerificationInput {
  challengeId: string;
  challenge: string;
  clientDataJSON: string; // raw bytes as base64url
  attestationObject: string; // raw bytes as base64url
}

export async function verifyRegistration(
  supabase: SupabaseClient,
  cfg: WebAuthnConfig,
  input: RegisterVerificationInput,
): Promise<{ credentialId: string; publicKey: string; counter: number; aaguid: string }> {
  const stored = await loadWebAuthnChallenge(supabase, input.challengeId);
  if (!stored || stored.status !== "pending" || stored.purpose !== "webauthn_register") {
    throw new Error("invalid or expired challenge");
  }
  if (new Date(stored.expires_at).getTime() < Date.now()) throw new Error("challenge expired");
  const hash = await sha256Hex(input.challenge);
  if (hash !== stored.challenge_hash) throw new Error("challenge mismatch");

  const clientDataJSON = fromB64Url(input.clientDataJSON);
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    throw new Error("malformed clientDataJSON");
  }
  if (clientData.type !== "webauthn.create") throw new Error("wrong client data type");
  if (clientData.challenge !== input.challenge) throw new Error("challenge mismatch");
  if (clientData.origin !== cfg.origin) throw new Error("origin mismatch");

  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", clientDataJSON as unknown as BufferSource),
  );

  const attestation = decode(fromB64Url(input.attestationObject)) as Map<unknown, unknown>;
  const authData = attestation.get("authData") as Uint8Array | undefined;
  if (!(authData instanceof Uint8Array)) throw new Error("missing authData");
  const parsed = parseAuthData(authData);

  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cfg.rpId)),
  );
  if (toHex(parsed.rpIdHash) !== toHex(rpIdHash)) throw new Error("rpIdHash mismatch");

  const point = parsed.coseKey ? coseKeyToRawPoint(parsed.coseKey) : null;
  if (!parsed.credId || !point) throw new Error("no credential data");

  void clientDataHash; // reserved for attestation formats that verify signatures

  const credentialId = toB64Url(parsed.credId);
  await supabase.from("admin_webauthn_credentials").upsert({
    admin_id: stored.created_by,
    credential_id: credentialId,
    public_key: toB64Url(point),
    algorithm: -7,
    counter: parsed.signCount,
    aaguid: parsed.aaguidHex,
  });
  await consumeWebAuthnChallenge(supabase, input.challengeId);

  return { credentialId, publicKey: toB64Url(point), counter: parsed.signCount, aaguid: parsed.aaguidHex };
}

// ---- Authentication (assertion) -------------------------------------------

export async function webauthnAuthOptions(
  supabase: SupabaseClient,
  cfg: WebAuthnConfig,
  adminId: string,
): Promise<Record<string, unknown>> {
  const { challengeId, challenge } = await issueWebAuthnChallenge(supabase, "webauthn_auth", adminId);
  const { data } = await supabase
    .from("admin_webauthn_credentials")
    .select("credential_id")
    .eq("admin_id", adminId)
    .eq("enabled", true);
  return {
    challengeId,
    challenge,
    rpId: cfg.rpId,
    timeout: 120_000,
    userVerification: "preferred",
    allowCredentials: (data || []).map((c: { credential_id: string }) => ({
      id: c.credential_id,
      type: "public-key",
    })),
  };
}

interface WebAuthnCredentialRow {
  credential_id: string;
  public_key: string;
  counter: number;
  admin_id: string;
}

/** Convert a DER-encoded ECDSA signature to raw r||s (64 bytes). */
function derToRawSignature(der: Uint8Array): Uint8Array | null {
  // SEQUENCE(0x30 len) INTEGER(0x02 len r) INTEGER(0x02 len s)
  if (der.length < 8 || der[0] !== 0x30) return null;
  const readInt = (start: number): { value: Uint8Array; next: number } => {
    if (der[start] !== 0x02) throw new Error("bad DER integer tag");
    const len = der[start + 1];
    return { value: der.slice(start + 2, start + 2 + len), next: start + 2 + len };
  };
  try {
    const r = readInt(2);
    const s = readInt(r.next);
    const pad = (v: Uint8Array): Uint8Array => {
      const arr = new Uint8Array(32);
      const src = v.length > 32 ? v.slice(v.length - 32) : v;
      arr.set(src, 32 - src.length);
      return arr;
    };
    const out = new Uint8Array(64);
    out.set(pad(r.value), 0);
    out.set(pad(s.value), 32);
    return out;
  } catch {
    return null;
  }
}

export interface AuthVerificationInput {
  challengeId: string;
  challenge: string;
  credentialId: string;
  clientDataJSON: string; // base64url
  authenticatorData: string; // base64url
  signature: string; // base64url (DER)
}

export async function verifyAuthentication(
  supabase: SupabaseClient,
  cfg: WebAuthnConfig,
  input: AuthVerificationInput,
): Promise<{ adminId: string; credentialId: string }> {
  const stored = await loadWebAuthnChallenge(supabase, input.challengeId);
  if (!stored || stored.status !== "pending" || stored.purpose !== "webauthn_auth") {
    throw new Error("invalid or expired challenge");
  }
  if (new Date(stored.expires_at).getTime() < Date.now()) throw new Error("challenge expired");
  const hash = await sha256Hex(input.challenge);
  if (hash !== stored.challenge_hash) throw new Error("challenge mismatch");

  const { data: cred } = await supabase
    .from("admin_webauthn_credentials")
    .select("*")
    .eq("credential_id", input.credentialId)
    .eq("enabled", true)
    .maybeSingle();
  if (!cred) throw new Error("unknown credential");
  const credential = cred as unknown as WebAuthnCredentialRow;

  const clientDataJSON = fromB64Url(input.clientDataJSON);
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    throw new Error("malformed clientDataJSON");
  }
  if (clientData.type !== "webauthn.get") throw new Error("wrong client data type");
  if (clientData.challenge !== input.challenge) throw new Error("challenge mismatch");
  if (clientData.origin !== cfg.origin) throw new Error("origin mismatch");

  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", clientDataJSON as unknown as BufferSource),
  );
  const authData = fromB64Url(input.authenticatorData);
  const parsed = parseAuthData(authData);

  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cfg.rpId)),
  );
  if (toHex(parsed.rpIdHash) !== toHex(rpIdHash)) throw new Error("rpIdHash mismatch");
  if ((parsed.flags & 0x01) === 0) throw new Error("user not present");

  // Counter rollback => the key material may be cloned.
  if (parsed.signCount !== 0 && parsed.signCount <= credential.counter) {
    throw new Error("credential counter rollback detected");
  }

  const raw = derToRawSignature(fromB64Url(input.signature));
  if (!raw) throw new Error("bad signature encoding");
  const publicKey = fromB64Url(credential.public_key);
  const key = await crypto.subtle.importKey(
    "raw",
    publicKey as unknown as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signedData = new Uint8Array(authData.length + clientDataHash.length);
  signedData.set(authData, 0);
  signedData.set(clientDataHash, authData.length);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    raw as unknown as BufferSource,
    signedData as unknown as BufferSource,
  );
  if (!valid) throw new Error("signature verification failed");

  await supabase
    .from("admin_webauthn_credentials")
    .update({ counter: parsed.signCount, last_used_at: new Date().toISOString() })
    .eq("credential_id", input.credentialId);
  await consumeWebAuthnChallenge(supabase, input.challengeId);

  return { adminId: credential.admin_id, credentialId: input.credentialId };
}
