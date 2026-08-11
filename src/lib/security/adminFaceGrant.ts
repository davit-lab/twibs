// Session-scoped biometric grant store.
//
// The grant JWT produced by the edge function is held ONLY in browser memory
// (never localStorage, never in any persisted store). Reloading the tab or a
// page navigation starts a fresh verification. The token is additionally
// revoked server-side when the admin locks their session or the grant expires.

export interface GrantRecord {
  token: string;
  expiresAt: number; // epoch ms
  factor: string;
}

let grant: GrantRecord | null = null;

export function setGrant(token: string, expiresInSeconds: number, factor = 'face'): void {
  grant = { token, expiresAt: Date.now() + expiresInSeconds * 1000, factor };
}

export function getGrant(): GrantRecord | null {
  if (!grant) return null;
  if (Date.now() >= grant.expiresAt) {
    grant = null;
    return null;
  }
  return grant;
}

export function clearGrant(): void {
  grant = null;
}

export function grantTimeRemainingMs(): number {
  if (!grant) return 0;
  return Math.max(0, grant.expiresAt - Date.now());
}
