/** Session, errors and sign-in throttling for the auth module. */

export type AuthProviderKind = 'local' | 'supabase';

export interface Identity {
  userId: string;
  email: string;
  displayName: string;
}

export interface Session extends Identity {
  provider: AuthProviderKind;
  /** Epoch ms after which the user must sign in again. */
  expiresAt: number;
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'invalid-recovery'
  | 'reset-link-invalid'
  | 'email-taken'
  | 'weak-password'
  | 'locked'
  | 'rate-limited'
  | 'email-limited'
  | 'network'
  | 'stale'
  | 'unknown';

const MESSAGES: Record<AuthErrorCode, string> = {
  // Deliberately the same for "no such account" and "wrong password".
  'invalid-credentials': 'Email or password is incorrect.',
  // Same message for unknown email, wrong code and missing code.
  'invalid-recovery': 'Email or recovery code is incorrect.',
  'reset-link-invalid':
    'This reset link has expired or was already used. Request a new one.',
  'email-taken':
    'An account with this email already exists on this device. Sign in instead.',
  'weak-password': 'Choose a stronger password.',
  locked: 'Too many attempts. Try again shortly.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  // The project's hourly email quota (sign-up confirmations, resets).
  'email-limited':
    'We can’t send more emails right now. Try again in an hour, or sign in if you already have an account.',
  network: 'Can’t reach the sign-in service. Check your connection.',
  stale:
    'Your account was just updated on another device. Nothing changed here; try again.',
  unknown: 'Something went wrong signing you in. Try again.',
};

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly retryAfterMs: number | null = null,
  ) {
    super(MESSAGES[code]);
    this.name = 'AuthError';
  }
}

export interface ThrottleRecord {
  failures: number;
  lockedUntil: number;
}

export const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

export type ThrottleDecision =
  { allowed: true } | { allowed: false; retryAfterMs: number };

export function checkThrottle(
  record: ThrottleRecord | null,
  now: number,
): ThrottleDecision {
  if (!record || record.lockedUntil <= now) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterMs: record.lockedUntil - now };
}

/** After the free attempts, each failure locks for twice as long (capped). */
export function recordFailure(
  record: ThrottleRecord | null,
  now: number,
): ThrottleRecord {
  const failures = (record?.failures ?? 0) + 1;
  if (failures < FREE_ATTEMPTS) {
    return { failures, lockedUntil: 0 };
  }
  const lock = Math.min(
    MAX_LOCK_MS,
    BASE_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS),
  );
  return { failures, lockedUntil: now + lock };
}

export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}
