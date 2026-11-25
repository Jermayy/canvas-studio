/**
 * AES-256-GCM sealing with the Web Crypto API. A fresh 96-bit IV per
 * message; GCM's auth tag means tampered or wrong-key data fails to open
 * instead of decrypting to garbage.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

export interface Sealed {
  iv: Bytes;
  data: ArrayBuffer;
}

export interface Cipher {
  seal: (plain: Bytes) => Promise<Sealed>;
  open: (sealed: Sealed) => Promise<Bytes>;
}

export class DecryptionError extends Error {
  constructor() {
    super('Data could not be decrypted with this key');
    this.name = 'DecryptionError';
  }
}

const IV_BYTES = 12;

export function createAesGcmCipher(
  key: CryptoKey,
  subtle = crypto.subtle,
): Cipher {
  return {
    seal: async (plain) => {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
      return { iv, data };
    },
    open: async ({ iv, data }) => {
      try {
        return new Uint8Array(
          await subtle.decrypt({ name: 'AES-GCM', iv }, key, data),
        );
      } catch {
        throw new DecryptionError();
      }
    },
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sealJson(
  cipher: Cipher,
  value: unknown,
): Promise<Sealed> {
  return cipher.seal(encoder.encode(JSON.stringify(value)));
}

export async function openJson(
  cipher: Cipher,
  sealed: Sealed,
): Promise<unknown> {
  return JSON.parse(decoder.decode(await cipher.open(sealed))) as unknown;
}

export function toBase64(bytes: Bytes): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
