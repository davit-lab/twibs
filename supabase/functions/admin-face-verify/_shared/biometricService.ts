// Biometric template storage & comparison.
//
// The enrolled face embedding (float64[128] from face-api's FaceRecognitionNet)
// is stored server-side and compared against the probe embedding using cosine
// similarity. The browser only ever holds a probe embedding in memory and sends
// it once; it never stores templates locally.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface BiometricCredential {
  id: string;
  admin_id: string;
  template: number[];
  model_version: string;
  threshold_override: number | null;
  enabled: boolean;
  version: number;
  updated_at: string;
}

export const DEFAULT_MODEL_VERSION = "face-api-resnet50-v1";

export async function loadCredential(
  supabase: SupabaseClient,
): Promise<BiometricCredential | null> {
  const { data } = await supabase
    .from("admin_biometric_credentials")
    .select("*")
    .eq("enabled", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BiometricCredential | null) ?? null;
}

/**
 * Cosine similarity between two embeddings in [-1, 1]. Identity matches are
 * typically >= 0.4 for the same person and <= 0.3 for different people with
 * this model; the default threshold of 0.55 is deliberately conservative and
 * configurable via FACE_VERIFICATION_THRESHOLD.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return -1;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function embeddingIsPlausible(embedding: unknown): embedding is number[] {
  return (
    Array.isArray(embedding) &&
    embedding.length === 128 &&
    embedding.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

export async function storeCredential(
  supabase: SupabaseClient,
  adminId: string,
  template: number[],
  modelVersion: string,
): Promise<void> {
  const existing = await loadCredential(supabase);

  // Rotation: increment version on replace, never keep old raw templates.
  const version = existing ? existing.version + 1 : 1;
  const { error } = await supabase
    .from("admin_biometric_credentials")
    .upsert({
      admin_id: adminId,
      template,
      model_version: modelVersion,
      enabled: true,
      version,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);

  if (error) throw new Error("Failed to store biometric credential");
}
