import {
  createAesGcmCipher,
  DecryptionError,
  fromBase64,
  openJson,
  sealJson,
} from '@/shared/crypto/aesGcm';
import { toBase64 } from '@/shared/crypto/aesGcm';

async function newKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

describe('AES-GCM cipher', () => {
  it('round-trips JSON with a fresh IV every time', async () => {
    const cipher = createAesGcmCipher(await newKey());
    const first = await sealJson(cipher, { name: 'Gala' });
    const second = await sealJson(cipher, { name: 'Gala' });
    expect(first.iv).toHaveLength(12);
    expect(toBase64(first.iv)).not.toBe(toBase64(second.iv));
    expect(await openJson(cipher, first)).toEqual({ name: 'Gala' });
  });

  it('refuses to open data sealed with another key or tampered with', async () => {
    const sealed = await sealJson(createAesGcmCipher(await newKey()), {
      secret: true,
    });
    await expect(
      openJson(createAesGcmCipher(await newKey()), sealed),
    ).rejects.toBeInstanceOf(DecryptionError);
    const tampered = new Uint8Array(sealed.data);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    const cipher = createAesGcmCipher(await newKey());
    await expect(
      cipher.open({ iv: sealed.iv, data: tampered.buffer }),
    ).rejects.toThrow('could not be decrypted');
  });

  it('encodes bytes as base64 and back', () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});
