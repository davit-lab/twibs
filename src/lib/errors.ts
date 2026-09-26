// Normalises anything thrown by the Supabase client into a message a human can
// act on.
//
// Why this exists: supabase-js rejects with a `PostgrestError`, which is a
// PLAIN OBJECT (`{ message, details, hint, code }`) and is NOT an instance of
// Error. So the common `err instanceof Error ? err.message : 'Something went
// wrong'` pattern silently discards the real, actionable message and shows a
// generic string instead. That is how database errors like
// "That username is already taken" reached users as a bare "400".
//
// RPCs raised with an explicit ERRCODE (see migration
// 20260927000000_business_account_error_codes.sql) also carry a code we can
// map to friendlier copy, so the UI never has to interpret raw Postgres
// messages.

export type FriendlyError = {
  message: string;
  /** Postgres/PostgREST error code, when one was supplied. */
  code?: string;
};

/**
 * Map a Postgres SQLSTATE to clearer user-facing copy.
 * Anything unmapped falls through to the server's own message.
 */
const CODE_MESSAGES: Record<string, string> = {
  // 42501 insufficient_privilege -> 403
  '42501': "You don't have permission to do that.",
  // P0002 no_data_found -> 404
  'P0002': "We couldn't find what you were looking for.",
  // 23505 unique_violation -> 409
  '23505': 'That value is already taken.',
  // 22023 invalid_parameter_value -> 400
  '22023': 'Please check the details you entered.',
  // 23503 foreign_key_violation
  '23503': 'That record is still linked to other data.',
  // 42501 duplicate of a few common validation codes used by our RPCs
  'PGRST116': "We couldn't find what you were looking for.",
  PGRST203: 'This request could not be processed. Please try again.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 * Falls back to `fallback` only when there is genuinely nothing to show.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong.'): FriendlyError {
  if (err === null || err === undefined) return { message: fallback };

  if (typeof err === 'string') {
    return { message: err.trim() || fallback };
  }

  if (err instanceof Error) {
    return { message: err.message || fallback, code: (err as Error & { code?: string }).code };
  }

  if (isRecord(err)) {
    // PostgrestError and friends expose `message`, sometimes `code`/`details`.
    const rawMessage =
      (typeof err.message === 'string' && err.message) ||
      (typeof err.error_description === 'string' && err.error_description) ||
      (typeof err.error === 'string' && err.error) ||
      (typeof err.details === 'string' && err.details) ||
      '';
    const code = typeof err.code === 'string' ? err.code : undefined;

    // Postgres error messages can be verbose and leak internals; prefer our
    // mapped copy for known codes, otherwise trust the server message but keep
    // it concise.
    const mapped = code ? CODE_MESSAGES[code] : undefined;
    const message = mapped || rawMessage.trim() || fallback;

    return { message, code };
  }

  return { message: fallback };
}

/** Convenience wrapper when you only need the string. */
export function friendlyErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  return friendlyError(err, fallback).message;
}
