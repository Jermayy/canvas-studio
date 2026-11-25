import { createImage } from '@/modules/document/domain/elementFactory';
import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  InvalidAssetEnvelopeError,
  openAsset,
  referencedAssetIds,
  sealAsset,
} from '@/modules/sync/envelope';
import {
  browserConnectivity,
  CONFLICT_SUFFIX,
  createSyncEngine,
  type Connectivity,
} from '@/modules/sync/syncEngine';
import type { RemoteWorkspace } from '@/modules/sync/remoteWorkspace';
import {
  createMemorySyncMetaStore,
  type SyncMetaStore,
} from '@/modules/sync/syncMeta';
import { workspaceSyncTarget } from '@/modules/sync/workspaceTarget';
import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
} from '@/modules/workspace/data/stores';
import {
  createWorkspaceStore,
  type WorkspaceStore,
} from '@/modules/workspace/state/workspaceStore';
import { createAesGcmCipher } from '@/shared/crypto/aesGcm';
import { createLogger } from '@/shared/logger';
import { createFakeCloud, type FakeCloud } from '@/test/fakeCloud';
import { makeDocument, NOW, pngFile, rect } from '@/test/factories';

const logger = createLogger({ service: 'test', sink: () => undefined });

function newKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function connectivity(initial = true) {
  let online = initial;
  const listeners = new Set<() => void>();
  const value: Connectivity & { set: (next: boolean) => void } = {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      online = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return value;
}

let deviceCounter = 0;

/** One browser signed in to the account: a real workspace store + engine. */
async function device(
  cloud: FakeCloud,
  key: CryptoKey,
  options: {
    saveDelayMs?: number;
    pageSize?: number;
    online?: boolean;
    retryBaseMs?: number;
    pollIntervalMs?: number;
    remote?: (base: RemoteWorkspace) => RemoteWorkspace;
    meta?: (base: SyncMetaStore) => SyncMetaStore;
  } = {},
) {
  deviceCounter += 1;
  const prefix = String(deviceCounter).padStart(4, '0');
  let ids = 0;
  const createId = () => {
    ids += 1;
    return `${prefix}0000-0000-4000-8000-${String(ids).padStart(12, '0')}`;
  };
  const baseMeta = createMemorySyncMetaStore();
  const meta = options.meta ? options.meta(baseMeta) : baseMeta;
  const network = connectivity(options.online ?? true);
  const holder: { store?: WorkspaceStore } = {};
  const engine = createSyncEngine({
    remote: options.remote
      ? options.remote(cloud.workspace())
      : cloud.workspace(),
    meta,
    target: workspaceSyncTarget(
      () => {
        if (!holder.store) {
          throw new Error('not ready');
        }
        return holder.store;
      },
      { createId, now: () => NOW },
    ),
    cipher: createAesGcmCipher(key),
    connectivity: network,
    logger,
    now: () => NOW,
    debounceMs: 0,
    pollIntervalMs: options.pollIntervalMs ?? 60_000,
    retryBaseMs: options.retryBaseMs ?? 60_000,
    pageSize: options.pageSize,
  });
  const store = createWorkspaceStore({
    documents: createMemoryDocumentStore(),
    assets: createMemoryAssetStore(),
    logger,
    persistent: true,
    now: () => NOW,
    createId,
    readImageSize: () => Promise.resolve({ width: 640, height: 480 }),
    onPersisted: engine.enqueue,
    onRemoved: engine.markDeleted,
    onAssetAdded: engine.assetAdded,
    onAssetRemoved: engine.assetRemoved,
    saveDelayMs: options.saveDelayMs ?? 0,
  });
  holder.store = store;
  await store.getState().load();
  const docs = () => Object.values(store.getState().documents);
  return { store, engine, meta, network, docs, createId };
}

async function edited(
  store: WorkspaceStore,
  document: DesignDocument,
  name: string,
) {
  store.getState().saveDocument({ ...document, name });
  await store.getState().flush();
}

const DOC_ID = '00000000-0000-4000-8000-0000000000d1';

describe('sync engine', () => {
  let cloud: FakeCloud;
  let key: CryptoKey;
  const engines: { dispose: () => Promise<void> }[] = [];

  beforeEach(async () => {
    cloud = createFakeCloud();
    key = await newKey();
  });

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.dispose()));
  });

  async function track(created: Promise<Awaited<ReturnType<typeof device>>>) {
    const value = await created;
    engines.push(value.engine);
    return value;
  }

  it('uploads only ciphertext and another device opens it with the same key', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const design = makeDocument({ id: DOC_ID, name: 'Secret gala poster' });
    await a.store.getState().createDocument(design);

    await a.engine.syncNow();

    const row = cloud.rows.get(DOC_ID);
    expect(row?.version).toBe(1);
    expect(JSON.stringify(row)).not.toContain('Secret gala');
    expect(a.engine.store.getState()).toMatchObject({
      status: 'synced',
      pending: 0,
      lastSyncedAt: NOW,
    });

    await b.engine.syncNow();
    expect(b.store.getState().documents[DOC_ID]).toEqual(design);
    expect(b.store.getState().remoteRevisions[DOC_ID]).toBe(1);
    // Pulling it again (our own echo, or an overlapping cursor) is a no-op.
    await b.engine.syncNow();
    expect(b.store.getState().remoteRevisions[DOC_ID]).toBe(1);
  });

  it('pushes later edits as new versions and the other device follows', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const design = makeDocument({ id: DOC_ID });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();
    await b.engine.syncNow();

    await edited(a.store, design, 'Renamed on A');
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(cloud.rows.get(DOC_ID)?.version).toBe(2);
    expect(b.store.getState().documents[DOC_ID]?.name).toBe('Renamed on A');
  });

  it('keeps both edits on a conflict: the server copy wins and mine becomes a copy', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const design = makeDocument({ id: DOC_ID, name: 'Poster' });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();
    await b.engine.syncNow();

    await edited(a.store, design, 'A’s version');
    await edited(b.store, design, 'B’s version');
    await a.engine.syncNow();
    await b.engine.syncNow();

    const names = b
      .docs()
      .map((document) => document.name)
      .sort();
    expect(names).toEqual(['A’s version', `B’s version${CONFLICT_SUFFIX}`]);
    // The copy was pushed too, so A gets it on its next pull.
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(a.docs()).toHaveLength(2);
    expect(cloud.rows.size).toBe(2);
  });

  it('treats an edit that hasn’t been stored yet as a conflict, not something to overwrite', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key, { saveDelayMs: 60_000 }));
    const design = makeDocument({ id: DOC_ID });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();
    await b.engine.syncNow();

    await edited(a.store, design, 'Remote edit');
    await a.engine.syncNow();
    b.store.getState().saveDocument({ ...design, name: 'Typing on B' });
    await b.engine.syncNow();

    expect(
      b
        .docs()
        .map((document) => document.name)
        .sort(),
    ).toEqual(['Remote edit', `Typing on B${CONFLICT_SUFFIX}`]);
  });

  it('syncs deletions as tombstones without ciphertext, and restores resurrect', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const design = makeDocument({ id: DOC_ID });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();
    await b.engine.syncNow();

    const removed = await a.store.getState().removeDocument(DOC_ID);
    await a.engine.syncNow();
    expect(cloud.rows.get(DOC_ID)).toMatchObject({ payload: null, version: 2 });
    await b.engine.syncNow();
    expect(b.store.getState().documents[DOC_ID]).toBeUndefined();

    await a.store.getState().restoreDocument(removed ?? design);
    await a.engine.syncNow();
    expect(cloud.rows.get(DOC_ID)).toMatchObject({
      version: 3,
      deletedAt: null,
    });
    await b.engine.syncNow();
    expect(b.store.getState().documents[DOC_ID]).toBeDefined();
  });

  it('never tells the server about a design deleted before it synced', async () => {
    const a = await track(device(cloud, key, { online: false }));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.store.getState().removeDocument(DOC_ID);
    a.network.set(true);
    await a.engine.syncNow();
    expect(cloud.calls).not.toContain('insert');
    expect(cloud.calls).not.toContain('update');
    expect(await a.meta.getDesign(DOC_ID)).toBeNull();
  });

  it('uploads images sealed, downloads them on the device that needs them, and deletes them', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const asset = await a.store.getState().addImage(pngFile('logo.png'));
    const design = makeDocument({
      id: DOC_ID,
      elements: [createImage('img-1', asset, { width: 1000, height: 1000 })],
    });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();

    const envelope = cloud.assets.get(asset.id) ?? '';
    expect(envelope).not.toContain('logo.png');
    await b.engine.syncNow();
    expect(b.store.getState().assets).toEqual([asset]);
    expect((await b.store.getState().getAssetBlob(asset.id))?.size).toBe(64);

    await a.store.getState().removeAsset(asset.id);
    await a.engine.syncNow();
    expect(cloud.assets.has(asset.id)).toBe(false);
  });

  it('pages through large pulls', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key, { pageSize: 2 }));
    for (let index = 0; index < 5; index += 1) {
      await a.store
        .getState()
        .createDocument(makeDocument({ id: a.createId(), elements: [rect()] }));
    }
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.docs()).toHaveLength(5);
  });

  it('pauses on failure with the reason, keeps the work queued and recovers on retry', async () => {
    const a = await track(device(cloud, key));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    cloud.failNext(1, 'gateway timeout');

    await a.engine.syncNow();
    expect(a.engine.store.getState()).toMatchObject({
      status: 'error',
      lastError: 'gateway timeout',
      pending: 1,
    });

    a.engine.retryNow();
    await vi.waitFor(() => {
      expect(a.engine.store.getState().status).toBe('synced');
    });
    expect(cloud.rows.has(DOC_ID)).toBe(true);
  });

  it('waits offline and syncs when the connection returns', async () => {
    const a = await track(device(cloud, key, { online: false }));
    a.engine.start();
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    expect(a.engine.store.getState().status).toBe('offline');
    expect(cloud.calls).toEqual([]);

    a.network.set(true);
    await vi.waitFor(() => {
      expect(cloud.rows.has(DOC_ID)).toBe(true);
    });
    a.network.set(false);
    expect(a.engine.store.getState()).toMatchObject({
      status: 'offline',
      live: false,
    });
  });

  it('refuses designs it can’t open instead of applying them', async () => {
    const a = await track(device(cloud, key));
    const stranger = await track(device(cloud, await newKey()));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();

    await stranger.engine.syncNow();
    expect(stranger.engine.store.getState()).toMatchObject({
      status: 'error',
      lastError: expect.stringContaining('couldn’t be opened'),
    });
    expect(stranger.docs()).toEqual([]);
  });

  it('pulls on realtime notifications and reports when it’s live', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    b.engine.start();
    await vi.waitFor(() => {
      expect(b.engine.store.getState().status).toBe('synced');
    });
    cloud.setRealtime('connected');
    expect(b.engine.store.getState().live).toBe(true);

    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    cloud.notify();
    await vi.waitFor(() => {
      expect(b.store.getState().documents[DOC_ID]).toBeDefined();
    });
    cloud.setRealtime('disconnected');
    expect(b.engine.store.getState().live).toBe(false);
  });

  it('runs one pass at a time and coalesces overlapping requests', async () => {
    const a = await track(device(cloud, key));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await Promise.all([
      a.engine.syncNow(),
      a.engine.syncNow(),
      a.engine.syncNow(),
    ]);
    expect(cloud.calls.filter((call) => call === 'insert')).toHaveLength(1);
    expect(
      cloud.calls.filter((call) => call === 'fetchChangedSince'),
    ).toHaveLength(2);
  });
});

describe('sync engine edge cases', () => {
  let cloud: FakeCloud;
  let key: CryptoKey;
  const engines: { dispose: () => Promise<void> }[] = [];

  beforeEach(async () => {
    cloud = createFakeCloud();
    key = await newKey();
  });

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.dispose()));
  });

  async function track(created: Promise<Awaited<ReturnType<typeof device>>>) {
    const value = await created;
    engines.push(value.engine);
    return value;
  }

  it('retries by itself after a failure, and polls for changes', async () => {
    const a = await track(device(cloud, key, { retryBaseMs: 5 }));
    const b = await track(device(cloud, key, { pollIntervalMs: 20 }));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    cloud.failNext(1);
    await a.engine.syncNow();
    expect(a.engine.store.getState().status).toBe('error');
    await vi.waitFor(() => {
      expect(cloud.rows.has(DOC_ID)).toBe(true);
    });
    b.engine.start();
    b.engine.start();
    await vi.waitFor(() => {
      expect(b.store.getState().documents[DOC_ID]).toBeDefined();
    });
  });

  it('skips images it can’t find or open, and still shows the design', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const asset = await a.store.getState().addImage(pngFile());
    const other = await a.store.getState().addImage(pngFile('two.png'));
    const canvas = { width: 1000, height: 1000 };
    await a.store.getState().createDocument(
      makeDocument({
        id: DOC_ID,
        elements: [
          createImage('i1', asset, canvas),
          createImage('i2', other, canvas),
        ],
      }),
    );
    await a.engine.syncNow();
    cloud.assets.delete(asset.id);
    cloud.assets.set(other.id, 'corrupt');
    await b.engine.syncNow();
    expect(b.store.getState().documents[DOC_ID]).toBeDefined();
    expect(b.store.getState().assets).toEqual([]);
  });

  it('refuses a design whose sealed content claims another id', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    const row = cloud.rows.get(DOC_ID);
    const swapped = '00000000-0000-4000-8000-0000000000d9';
    if (row) {
      cloud.rows.set(swapped, { ...row, id: swapped, updatedAt: 'z' });
    }
    await b.engine.syncNow();
    expect(b.engine.store.getState().status).toBe('error');
    expect(b.store.getState().documents[swapped]).toBeUndefined();
  });

  it('keeps a local edit as a copy when the design was deleted elsewhere', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    const design = makeDocument({ id: DOC_ID, name: 'Poster' });
    await a.store.getState().createDocument(design);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.store.getState().removeDocument(DOC_ID);
    await a.engine.syncNow();
    await edited(b.store, design, 'Still working on it');
    await b.engine.syncNow();
    expect(b.docs().map((document) => document.name)).toEqual([
      `Still working on it${CONFLICT_SUFFIX}`,
    ]);
  });

  it('moves the work to a copy if the id can’t be used in the cloud', async () => {
    const a = await track(
      device(cloud, key, {
        remote: (base) => ({
          ...base,
          insert: (write) =>
            write.id === DOC_ID ? Promise.resolve(null) : base.insert(write),
          fetchById: () => Promise.resolve(null),
        }),
      }),
    );
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    expect(a.store.getState().documents[DOC_ID]).toBeUndefined();
    expect(a.docs()).toHaveLength(1);
    expect(await a.meta.getDesign(DOC_ID)).toBeNull();
  });

  it('re-pulls everything when the cursor is corrupt', async () => {
    const a = await track(device(cloud, key));
    const b = await track(device(cloud, key));
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    await b.meta.setCursor({ updatedAt: 'garbage', id: 'x' });
    await b.engine.syncNow();
    expect(b.store.getState().documents[DOC_ID]).toBeDefined();
  });

  it('logs bookkeeping failures without breaking later syncs', async () => {
    let failing = true;
    const a = await track(
      device(cloud, key, {
        meta: (base) => ({
          ...base,
          updateDesign: (id, change) =>
            failing
              ? Promise.reject(new Error('disk full'))
              : base.updateDesign(id, change),
        }),
      }),
    );
    await a.store.getState().createDocument(makeDocument({ id: DOC_ID }));
    await a.engine.syncNow();
    expect(cloud.rows.size).toBe(0);
    failing = false;
    await a.store.getState().createDocument(makeDocument({ id: a.createId() }));
    await a.engine.syncNow();
    expect(cloud.rows.size).toBe(1);
  });

  it('does nothing once disposed', async () => {
    const a = await device(cloud, key);
    await a.engine.dispose();
    a.engine.start();
    await a.engine.syncNow();
    expect(cloud.calls).toEqual([]);
  });

  it('follows the browser’s online and offline events', () => {
    const target = new EventTarget() as EventTarget & {
      navigator: { onLine: boolean };
    };
    target.navigator = { onLine: false };
    const network = browserConnectivity(target as unknown as Window);
    const onChange = vi.fn();
    const unsubscribe = network.subscribe(onChange);
    expect(network.isOnline()).toBe(false);
    target.dispatchEvent(new Event('online'));
    target.dispatchEvent(new Event('offline'));
    unsubscribe();
    target.dispatchEvent(new Event('online'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('sealed envelopes', () => {
  it('round-trips images and rejects anything malformed', async () => {
    const cipher = createAesGcmCipher(await newKey());
    const meta = {
      id: 'a1',
      name: 'photo.png',
      mimeType: 'image/png',
      width: 10,
      height: 10,
      size: 3,
      createdAt: new Date(NOW).toISOString(),
    };
    const sealed = await sealAsset(
      cipher,
      meta,
      new Blob([new Uint8Array([1, 2, 3])]),
    );
    const opened = await openAsset(cipher, sealed);
    expect(opened.meta).toEqual(meta);
    expect(opened.blob.type).toBe('image/png');
    await expect(openAsset(cipher, '{"v":2}')).rejects.toBeInstanceOf(
      InvalidAssetEnvelopeError,
    );
    await expect(openAsset(cipher, 'not json')).rejects.toBeInstanceOf(
      InvalidAssetEnvelopeError,
    );
  });

  it('lists each image a design uses once', () => {
    const asset = { id: 'a1', width: 10, height: 10, name: 'x.png' };
    const canvas = { width: 100, height: 100 };
    const design = makeDocument({
      elements: [
        createImage('i1', asset, canvas),
        createImage('i2', asset, canvas),
        rect(),
      ],
    });
    expect(referencedAssetIds(design)).toEqual(['a1']);
  });
});
