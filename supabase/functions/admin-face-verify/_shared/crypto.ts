// Crypto primitives used by the admin face-verification service.
// Runs inside the Deno Edge Function runtime (WebCrypto).

const enc = new TextEncoder();

export function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

export interface GrantClaims {
  sub: string;
  purpose: "admin-face-grant";
  factor: "face" | "passkey";
  jti: string; // admin_face_sessions.id — enables server-side revocation
  iat: number;
  exp: number;
}

/** Sign a compact JWT (HS256) with the edge-function secret. */
export async function signGrantJwt(claims: GrantClaims, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = toB64Url(enc.encode(JSON.stringify(header)));
  const encPayload = toB64Url(enc.encode(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encPayload}`;
  const sig = await hmacSha256(secret, signingInput);
  return `${signingInput}.${toB64Url(sig)}`;
}

/**
 * Verify a compact JWT. Returns the parsed claims or null on any failure
 * (bad signature, wrong purpose, expired). Does NOT check server-side
 * revocation — callers must additionally verify the session row.
 */
export async function verifyGrantJwt(
  token: string,
  secret: string,
): Promise<GrantClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;
  const signingInput = `${encHeader}.${encPayload}`;

  const expected = await hmacSha256(secret, signingInput);
  const provided = fromB64Url(encSig);
  if (expected.length !== provided.length) return null;
  for (let i = 0; i < expected.length; i++) if (expected[i] !== provided[i]) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(encPayload)));
    if (payload.purpose !== "admin-face-grant") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload as GrantClaims;
  } catch {
    return null;
  }
}
