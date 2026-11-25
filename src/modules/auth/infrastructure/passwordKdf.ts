import type { Bytes } from '@/shared/crypto/aesGcm';

/**
 * PBKDF2-HMAC-SHA256 (Web Crypto). Argon2id isn't available in browsers
 * without WASM; OWASP's PBKDF2-SHA256 guidance is 600,000 iterations.
 * Tests pass a small count to stay fast.
 */

export const DEFAULT_ITERATIONS = 600_000;
export const SALT_BYTES = 16;

const encoder = new TextEncoder();

export function randomSalt(): Bytes {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

async function passwordKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
}

export async function deriveVerifier(
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    await passwordKey(password),
    256,
  );
  return new Uint8Array(bits);
}

export async function deriveWrappingKey(
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    await passwordKey(password),
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Compares without an early exit, so timing doesn't reveal a prefix match. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
