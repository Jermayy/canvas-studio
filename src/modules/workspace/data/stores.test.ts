import {
  createEncryptedAssetStore,
  createEncryptedDocumentStore,
  WorkspaceDatabase,
  workspaceDatabaseName,
} from '@/modules/workspace/data/encryptedStores';
import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
  type AssetMeta,
} from '@/modules/workspace/data/stores';
import { createAesGcmCipher } from '@/shared/crypto/aesGcm';
import { createLogger } from '@/shared/logger';
import { makeDocument, NOW_ISO, rect } from '@/test/factories';

const logger = createLogger({ service: 'test', sink: () => undefined });

async function cipher() {
  return createAesGcmCipher(
    await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
  );
}

const meta: AssetMeta = {
  id: 'asset-1',
  name: 'photo.png',
  mimeType: 'image/png',
  width: 10,
  height: 20,
  size: 3,
  createdAt: NOW_ISO,
};

let counter = 0;
function freshDb(): WorkspaceDatabase {
  counter += 1;
  return new WorkspaceDatabase(workspaceDatabaseName(`user-${counter}`));
}

describe('encrypted document store', () => {
  it('round-trips documents without storing anything readable', async () => {
    const db = freshDb();
    const store = createEncryptedDocumentStore(db, await cipher(), logger);
    const document = makeDocument({ name: 'Secret gala', elements: [rect()] });
    await store.put(document);

    expect(await store.list()).toEqual({ documents: [document], skipped: 0 });
    const [row] = await db.documents.toArray();
    expect(Object.keys(row ?? {})).toEqual(['id', 'payload']);
    expect(
      new TextDecoder().decode(
        new Uint8Array(row?.payload.data ?? new ArrayBuffer(0)),
      ),
    ).not.toContain('Secret gala');

    await store.remove(document.id);
    expect((await store.list()).documents).toEqual([]);
  });

  it('skips records it can’t decrypt or validate, and reports how many', async () => {
    const db = freshDb();
    const keyA = await cipher();
    await createEncryptedDocumentStore(db, keyA, logger).put(
      makeDocument({ id: 'a' }),
    );
    const keyB = await cipher();
    const storeB = createEncryptedDocumentStore(db, keyB, logger);
    await storeB.put(makeDocument({ id: 'b' }));
    const result = await storeB.list();
    expect(result.documents.map((document) => document.id)).toEqual(['b']);
    expect(result.skipped).toBe(1);
  });
});

describe('encrypted asset store', () => {
  it('round-trips image bytes and metadata', async () => {
    const store = createEncryptedAssetStore(freshDb(), await cipher(), logger);
    await store.put(
      meta,
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    expect(await store.list()).toEqual([meta]);
    const blob = await store.get(meta.id);
    expect(blob?.type).toBe('image/png');
    expect([
      ...new Uint8Array(await (blob ?? new Blob()).arrayBuffer()),
    ]).toEqual([1, 2, 3]);
    expect(await store.get('missing')).toBeNull();
    await store.remove(meta.id);
    expect(await store.list()).toEqual([]);
  });

  it('hides assets sealed with another key', async () => {
    const db = freshDb();
    await createEncryptedAssetStore(db, await cipher(), logger).put(
      meta,
      new Blob(['x']),
    );
    const other = createEncryptedAssetStore(db, await cipher(), logger);
    expect(await other.list()).toEqual([]);
    expect(await other.get(meta.id)).toBeNull();
  });
});

describe('memory stores', () => {
  it('behave like the encrypted ones without persisting', async () => {
    const documents = createMemoryDocumentStore([makeDocument({ id: 'x' })]);
    await documents.put(makeDocument({ id: 'y' }));
    await documents.remove('x');
    expect(
      (await documents.list()).documents.map((document) => document.id),
    ).toEqual(['y']);

    const assets = createMemoryAssetStore();
    await assets.put(meta, new Blob(['a']));
    expect(await assets.list()).toEqual([meta]);
    expect(await assets.get(meta.id)).not.toBeNull();
    await assets.remove(meta.id);
    expect(await assets.get(meta.id)).toBeNull();
  });
});
