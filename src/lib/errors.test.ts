import { describe, it, expect } from 'vitest';
import { friendlyError, friendlyErrorMessage } from '@/lib/errors';

// Regression coverage for the bug where business/account creation only ever
// surfaced a generic message. supabase-js rejects with a PostgrestError, which
// is a PLAIN OBJECT and not an `instanceof Error`, so the ubiquitous
// `err instanceof Error ? err.message : 'fallback'` guard discarded the real
// database message and the user just saw something like "400".

describe('friendlyError', () => {
  it('reads the message from a PostgrestError-shaped plain object', () => {
    const postgrestError = {
      message: 'That username is already taken',
      details: null,
      hint: null,
      code: '23505',
    };
    // The whole point: this value is NOT an Error instance.
    expect(postgrestError instanceof Error).toBe(false);
    expect(friendlyErrorMessage(postgrestError)).toBe('That value is already taken.');
  });

  it('keeps the server message when the code has no friendlier mapping', () => {
    const err = { message: 'A business has exactly one owner', code: 'P0001' };
    expect(friendlyErrorMessage(err)).toBe('A business has exactly one owner');
  });

  it('passes through real Error instances', () => {
    expect(friendlyErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('handles plain strings', () => {
    expect(friendlyErrorMessage('something broke')).toBe('something broke');
  });

  it('falls back for null/undefined and empty values', () => {
    expect(friendlyErrorMessage(null, 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage({}, 'fallback')).toBe('fallback');
    expect(friendlyErrorMessage('   ', 'fallback')).toBe('fallback');
  });

  it('never returns an empty message', () => {
    for (const value of [null, undefined, {}, '', '  ', new Error('')]) {
      expect(friendlyErrorMessage(value, 'safe fallback').length).toBeGreaterThan(0);
    }
  });

  it('maps permission and not-found codes to readable copy', () => {
    expect(friendlyError({ code: '42501', message: 'permission denied' })).toEqual({
      message: "You don't have permission to do that.",
      code: '42501',
    });
    expect(friendlyErrorMessage({ code: 'P0002', message: 'no data' })).toBe(
      "We couldn't find what you were looking for."
    );
  });

  it('understands auth-style error shapes', () => {
    expect(friendlyErrorMessage({ error_description: 'Invalid login credentials' })).toBe(
      'Invalid login credentials'
    );
    expect(friendlyErrorMessage({ error: 'Invalid login credentials' })).toBe(
      'Invalid login credentials'
    );
  });

  it('returns a message string via the convenience wrapper', () => {
    expect(typeof friendlyError(new Error('x')).message).toBe('string');
  });
});
