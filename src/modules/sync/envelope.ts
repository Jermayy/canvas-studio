import {
  parseDocument,
  type DesignDocument,
} from '@/modules/document/domain/schema';
import type { WireSealed } from '@/modules/sync/remoteWorkspace';
import { isAssetMeta, type AssetMeta } from '@/modules/workspace/data/stores';
import {
  fromBase64,
  openJson,
  sealJson,
  toBase64,
  type Cipher,
  type Sealed,
} from '@/shared/crypto/aesGcm';
import { z } from 'zod';

/**
 * Converts workspace records to and from the sealed form stored in the
 * cloud. Opening validates everything: data from the server is untrusted
 * even when it decrypts (GCM proves it was sealed with this key, not that
 * this app version can read it).
 */

export function toWire(sealed: Sealed): WireSealed {
  return {
    iv: toBase64(sealed.iv),
    ciphertext: toBase64(new Uint8Array(sealed.data)),
  };
}

export function fromWire(wire: WireSealed): Sealed {
  return { iv: fromBase64(wire.iv), data: fromBase64(wire.ciphertext).buffer };
}

export async function sealDocument(
  cipher: Cipher,
  document: DesignDocument,
): Promise<WireSealed> {
  return toWire(await sealJson(cipher, document));
}

/** Throws `DecryptionError` or `DocumentValidationError`. */
export async function openDocument(
  cipher: Cipher,
  wire: WireSealed,
): Promise<DesignDocument> {
  return parseDocument(await openJson(cipher, fromWire(wire)));
}

const wireSchema = z.object({
  iv: z.string().min(1).max(64),
  ciphertext: z.string().min(1),
});

const assetEnvelopeSchema = z.object({
  v: z.literal(1),
  meta: wireSchema,
  bytes: wireSchema,
});

export class InvalidAssetEnvelopeError extends Error {
  constructor() {
    super('The cloud copy of an image is unreadable');
    this.name = 'InvalidAssetEnvelopeError';
  }
}

/** One JSON object per image: sealed metadata and sealed bytes. */
export async function sealAsset(
  cipher: Cipher,
  meta: AssetMeta,
  blob: Blob,
): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return JSON.stringify({
    v: 1,
    meta: toWire(await sealJson(cipher, meta)),
    bytes: toWire(await cipher.seal(bytes)),
  });
}

export async function openAsset(
  cipher: Cipher,
  envelope: string,
): Promise<{ meta: AssetMeta; blob: Blob }> {
  let parsed: z.infer<typeof assetEnvelopeSchema>;
  try {
    parsed = assetEnvelopeSchema.parse(JSON.parse(envelope));
  } catch {
    throw new InvalidAssetEnvelopeError();
  }
  const meta = await openJson(cipher, fromWire(parsed.meta));
  if (!isAssetMeta(meta)) {
    throw new InvalidAssetEnvelopeError();
  }
  const bytes = await cipher.open(fromWire(parsed.bytes));
  return { meta, blob: new Blob([bytes], { type: meta.mimeType }) };
}

/** Uploaded images a design uses (so a pulled design can be shown). */
export function referencedAssetIds(document: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const element of document.elements) {
    if (element.type === 'image') {
      ids.add(element.assetId);
    }
  }
  return [...ids];
}
