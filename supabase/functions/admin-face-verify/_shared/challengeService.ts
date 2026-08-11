// Challenge issuance & lifecycle.
//
// Every liveness run is bound to a single, one-time, expiring challenge that
// is issued by the SERVER (never constructed client-side). The server stores
// only the SHA-256 hash of the nonce; the raw nonce lives in browser memory.

import { randomBytes, sha256Hex } from "./crypto.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type InstructionType =
  | "center"
  | "left"
  | "right"
  | "up"
  | "down"
  | "blink"
  | "smile"
  | "open_mouth";

export interface ChallengeInstruction {
  type: InstructionType;
  /** Human label shown to the admin. */
  label: string;
  /** Total window the instruction is active, in ms. */
  windowMs: number;
}

export interface IssuedChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  sequence: ChallengeInstruction[];
}

const INSTRUCTIONS: Record<
  Exclude<InstructionType, "center">,
  { label: string; windowMs: number }
> = {
  left: { label: "Turn your head left", windowMs: 3200 },
  right: { label: "Turn your head right", windowMs: 3200 },
  up: { label: "Tilt your head up", windowMs: 3200 },
  down: { label: "Tilt your head down", windowMs: 3200 },
  blink: { label: "Blink twice", windowMs: 4200 },
  smile: { label: "Smile", windowMs: 4200 },
  open_mouth: { label: "Open your mouth", windowMs: 4200 },
};

/** Pick a random instruction type that is not `previous`. */
function sampleInstruction(previous?: InstructionType): InstructionType {
  const pool = Object.keys(INSTRUCTIONS) as InstructionType[];
  let pick = previous;
  while (pick === previous) {
    pick = pool[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000 * pool.length)];
  }
  return pick;
}

/**
 * Build a randomized challenge sequence. Structure:
 *   center → (gaze x1-2, micro x2) → center
 * The ordering is random per issuance, never hardcoded client-side.
 */
export function generateSequence(): ChallengeInstruction[] {
  const micros: InstructionType[] = ["blink", "smile", "open_mouth"];
  const gazes: InstructionType[] = ["left", "right", "up", "down"];

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(
        (crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000) * (i + 1),
      );
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const seq: ChallengeInstruction[] = [{ type: "center", label: "Look at the camera", windowMs: 2800 }];

  const chosenGazes = shuffle(gazes).slice(0, 1 + Math.floor(Math.random() * 2)); // 1-2
  const chosenMicros = shuffle(micros).slice(0, 2); // exactly 2 micros
  const body = shuffle([...chosenGazes, ...chosenMicros]);

  let prev: InstructionType = "center";
  for (const type of body) {
    if (type === prev) continue; // never repeat the same gesture consecutively
    seq.push({ type, label: INSTRUCTIONS[type].label, windowMs: INSTRUCTIONS[type].windowMs });
    prev = type;
  }

  seq.push({ type: "center", label: "Look at the camera", windowMs: 2000 });
  return seq;
}

export function challengeConfig() {
  return {
    expirationSeconds: clampInt(Deno.env.get("FACE_CHALLENGE_EXPIRATION_SECONDS"), 60, 600, 120),
    minDurationMs: clampInt(Deno.env.get("FACE_CHALLENGE_MIN_DURATION_MS"), 6000, 120000, 10000),
    maxDurationMs: clampInt(Deno.env.get("FACE_CHALLENGE_MAX_DURATION_MS"), 10000, 300000, 35000),
    maxAttempts: clampInt(Deno.env.get("FACE_MAX_ATTEMPTS"), 1, 10, 3),
    threshold: clampFloat(Deno.env.get("FACE_VERIFICATION_THRESHOLD"), 0.1, 1.0, 0.55),
    grantTtlSeconds: clampInt(Deno.env.get("FACE_GRANT_TTL_SECONDS"), 60, 86400, 1800),
    rateLimitAttempts: clampInt(Deno.env.get("FACE_RATE_LIMIT_ATTEMPTS"), 1, 100, 10),
    rateLimitWindowSeconds: clampInt(Deno.env.get("FACE_RATE_LIMIT_WINDOW_SECONDS"), 60, 3600, 300),
  };
}

export function clampInt(v: string | undefined, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampFloat(v: string | undefined, min: number, max: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export interface IssueParams {
  purpose: "verify" | "enroll";
  ipHash: string | null;
  userAgent: string | null;
  adminId?: string;
}

export async function issueChallenge(
  supabase: SupabaseClient,
  params: IssueParams,
): Promise<IssuedChallenge> {
  const nonce = toB64Url(randomBytes(32));
  const hash = await sha256Hex(nonce);
  const sequence = generateSequence();
  const config = challengeConfig();

  const { data, error } = await supabase
    .from("verification_challenges")
    .insert({
      purpose: params.purpose,
      challenge_hash: hash,
      sequence,
      expires_at: new Date(Date.now() + config.expirationSeconds * 1000).toISOString(),
      created_by: params.adminId ?? null,
      ip_hash: params.ipHash,
      user_agent: params.userAgent,
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error("Failed to issue challenge");
  }

  return {
    challengeId: data.id,
    nonce,
    expiresAt: data.expires_at,
    sequence,
  };
}

export interface ChallengeRow {
  id: string;
  purpose: string;
  challenge_hash: string;
  sequence: ChallengeInstruction[];
  expires_at: string;
  used_at: string | null;
  attempt_count: number;
  status: string;
  created_by: string | null;
}

export async function loadChallenge(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<ChallengeRow | null> {
  const { data } = await supabase
    .from("verification_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  return (data as ChallengeRow | null) ?? null;
}

export async function updateChallengeStatus(
  supabase: SupabaseClient,
  challengeId: string,
  patch: { status: string; used_at?: string; attempt_count?: number },
): Promise<void> {
  await supabase.from("verification_challenges").update(patch).eq("id", challengeId);
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
