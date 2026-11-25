import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
  type DocumentStore,
} from '@/modules/workspace/data/stores';
import {
  checkImageDimensions,
  checkImageUpload,
  sniffImageType,
} from '@/modules/workspace/domain/imageUpload';
import {
  createWorkspaceStore,
  UploadRejectedError,
  type WorkspaceDependencies,
} from '@/modules/workspace/state/workspaceStore';
import { createLogger } from '@/shared/logger';
import { makeDocument, NOW, pngFile } from '@/test/factories';

function setup(overrides: Partial<WorkspaceDependencies> = {}) {
  const documents = createMemoryDocumentStore();
  const deps: WorkspaceDependencies = {
    documents,
    assets: createMemoryAssetStore(),
    logger: createLogger({ service: 'test', sink: () => undefined }),
    persistent: true,
    now: () => NOW,
    createId: () => 'new-id',
    readImageSize: () => Promise.resolve({ width: 800, height: 600 }),
    saveDelayMs: 400,
    ...overrides,
  };
  return { store: createWorkspaceStore(deps), documents: deps.documents };
}

describe('workspace store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads documents and assets', async () => {
    const documents = createMemoryDocumentStore([makeDocument({ id: 'a' })]);
    const { store } = setup({ documents });
    const loading = store.getState().load();
    expect(store.getState().status).toBe('loading');
    await loading;
    expect(store.getState()).toMatchObject({ status: 'ready', skipped: 0 });
    expect(Object.keys(store.getState().documents)).toEqual(['a']);
  });

  it('reports a load failure', async () => {
    const failing: DocumentStore = {
      ...createMemoryDocumentStore(),
      list: () => Promise.reject(new Error('boom')),
    };
    const { store } = setup({ documents: failing });
    await store.getState().load();
    expect(store.getState().status).toBe('error');
    expect(store.getState().loadError).toMatch(/couldn’t be loaded/);
  });

  it('applies edits instantly and writes them after a pause (optimistic save)', async () => {
    const put = vi.fn(() => Promise.resolve());
    const onPersisted = vi.fn();
    const { store } = setup({
      documents: { ...createMemoryDocumentStore(), put },
      onPersisted,
    });
    const document = makeDocument({ id: 'd' });

    store.getState().saveDocument({ ...document, name: 'v1' });
    store.getState().saveDocument({ ...document, name: 'v2' });
    expect(store.getState().documents.d?.name).toBe('v2');
    expect(store.getState().documents.d?.updatedAt).toBe(
      new Date(NOW).toISOString(),
    );
    expect(store.getState().saves.d?.status).toBe('pending');
    expect(put).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.getState().saves.d).toEqual({
      status: 'saved',
      savedAt: NOW,
      error: null,
    });
    expect(onPersisted).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'v2' }),
    );
  });

  it('keeps the edit and shows an error when a save fails, then retries', async () => {
    const put = vi
      .fn<DocumentStore['put']>()
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
      .mockResolvedValue(undefined);
    const { store } = setup({
      documents: { ...createMemoryDocumentStore(), put },
    });
    store.getState().saveDocument(makeDocument({ id: 'd', name: 'Keep me' }));
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().saves.d).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/storage is full/),
    });
    expect(store.getState().documents.d?.name).toBe('Keep me');

    await store.getState().retrySave('d');
    expect(store.getState().saves.d?.status).toBe('saved');
  });

  it('uses a generic message for other save failures', async () => {
    const put = vi
      .fn<DocumentStore['put']>()
      .mockRejectedValue(new Error('disk'));
    const { store } = setup({
      documents: { ...createMemoryDocumentStore(), put },
    });
    store.getState().saveDocument(makeDocument({ id: 'd' }));
    await store.getState().flush();
    expect(store.getState().saves.d?.error).toBe(
      'Couldn’t save to this browser’s storage.',
    );
  });

  it('flushes pending writes immediately', async () => {
    const { store, documents } = setup();
    store.getState().saveDocument(makeDocument({ id: 'd' }));
    await store.getState().flush();
    expect((await documents.list()).documents).toHaveLength(1);
  });

  it('creates, renames and duplicates the guard rails', async () => {
    const { store } = setup();
    await store
      .getState()
      .createDocument(makeDocument({ id: 'd', name: 'Old' }));
    store.getState().renameDocument('d', '  New name  ');
    expect(store.getState().documents.d?.name).toBe('New name');
    store.getState().renameDocument('d', '   ');
    store.getState().renameDocument('missing', 'x');
    expect(store.getState().documents.d?.name).toBe('New name');
  });

  it('deletes optimistically and restores', async () => {
    const { store, documents } = setup();
    await store.getState().createDocument(makeDocument({ id: 'd' }));
    store.getState().saveDocument(makeDocument({ id: 'd', name: 'pending' }));
    const removed = await store.getState().removeDocument('d');
    expect(store.getState().documents.d).toBeUndefined();
    expect((await documents.list()).documents).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await documents.list()).documents).toHaveLength(0);

    await store.getState().restoreDocument(removed ?? makeDocument());
    expect(store.getState().documents.d).toBeDefined();
    expect(await store.getState().removeDocument('missing')).toBeNull();
  });

  it('rolls a failed delete back', async () => {
    const remove = vi
      .fn<DocumentStore['remove']>()
      .mockRejectedValue(new Error('locked'));
    const { store } = setup({
      documents: { ...createMemoryDocumentStore(), remove },
    });
    await store.getState().createDocument(makeDocument({ id: 'd' }));
    await expect(store.getState().removeDocument('d')).rejects.toThrow(
      'locked',
    );
    expect(store.getState().documents.d).toBeDefined();
  });

  it('stores valid images and lists them first', async () => {
    const { store } = setup();
    const meta = await store.getState().addImage(pngFile('Beach.png'));
    expect(meta).toMatchObject({
      id: 'new-id',
      name: 'Beach.png',
      mimeType: 'image/png',
      width: 800,
    });
    expect(store.getState().assets[0]).toBe(meta);
    expect((await store.getState().getAssetBlob('new-id'))?.type).toBe(
      'image/png',
    );
    await store.getState().removeAsset('new-id');
    expect(store.getState().assets).toEqual([]);
  });

  it('rejects files that aren’t images, can’t be decoded or are too big', async () => {
    const { store } = setup();
    const fake = new File(['<svg onload=alert(1)>'], 'logo.png', {
      type: 'image/png',
    });
    await expect(store.getState().addImage(fake)).rejects.toBeInstanceOf(
      UploadRejectedError,
    );

    const undecodable = setup({
      readImageSize: () => Promise.reject(new Error('decode')),
    });
    await expect(
      undecodable.store.getState().addImage(pngFile()),
    ).rejects.toThrow(/couldn’t be read/);

    const huge = setup({
      readImageSize: () => Promise.resolve({ width: 20_000, height: 10 }),
    });
    await expect(huge.store.getState().addImage(pngFile())).rejects.toThrow(
      /12,000 px/,
    );
  });

  it('cancels pending timers on dispose', async () => {
    const put = vi.fn(() => Promise.resolve());
    const { store } = setup({
      documents: { ...createMemoryDocumentStore(), put },
    });
    store.getState().saveDocument(makeDocument());
    store.getState().dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(put).not.toHaveBeenCalled();
  });

  it('applies changes from other devices without echoing them back', async () => {
    const onPersisted = vi.fn();
    const onRemoved = vi.fn();
    const onAssetAdded = vi.fn();
    const onAssetRemoved = vi.fn();
    const { store, documents } = setup({
      onPersisted,
      onRemoved,
      onAssetAdded,
      onAssetRemoved,
    });
    await store.getState().load();
    const remote = makeDocument({ id: 'r', name: 'From another device' });
    await store.getState().applyRemoteDocument(remote);
    expect(store.getState().documents.r).toEqual(remote);
    expect(store.getState().remoteRevisions.r).toBe(1);
    expect(store.getState().saves.r?.status).toBe('saved');
    expect((await documents.list()).documents).toEqual([remote]);
    expect(onPersisted).not.toHaveBeenCalled();

    store.getState().saveDocument({ ...remote, name: 'Typing' });
    expect(store.getState().hasUnsavedChanges('r')).toBe(true);
    await store.getState().removeRemoteDocument('r');
    expect(store.getState().documents.r).toBeUndefined();
    expect(store.getState().remoteRevisions.r).toBe(2);
    expect(store.getState().hasUnsavedChanges('r')).toBe(false);
    await vi.runAllTimersAsync();
    expect(onPersisted).not.toHaveBeenCalled();

    const meta = {
      id: 'img',
      name: 'x.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      size: 1,
      createdAt: new Date(NOW).toISOString(),
    };
    await store.getState().applyRemoteAsset(meta, new Blob(['x']));
    await store.getState().applyRemoteAsset(meta, new Blob(['x']));
    expect(store.getState().assets).toEqual([meta]);
    expect(onAssetAdded).not.toHaveBeenCalled();
  });

  it('tells sync about local deletions and image changes', async () => {
    const onRemoved = vi.fn();
    const onAssetAdded = vi.fn();
    const onAssetRemoved = vi.fn();
    const { store } = setup({ onRemoved, onAssetAdded, onAssetRemoved });
    await store.getState().createDocument(makeDocument({ id: 'd' }));
    await store.getState().removeDocument('d');
    expect(onRemoved).toHaveBeenCalledWith('d');
    const asset = await store.getState().addImage(pngFile());
    expect(onAssetAdded).toHaveBeenCalledWith(asset.id);
    await store.getState().removeAsset(asset.id);
    expect(onAssetRemoved).toHaveBeenCalledWith(asset.id);
  });
});

describe('image upload rules', () => {
  const header = (...bytes: number[]) =>
    new Uint8Array([...bytes, ...new Array<number>(12).fill(0)]);

  it('detects real image types from their bytes', () => {
    expect(sniffImageType(header(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffImageType(header(0x47, 0x49, 0x46, 0x38))).toBe('image/gif');
    const webp = header(
      0x52,
      0x49,
      0x46,
      0x46,
      0,
      0,
      0,
      0,
      0x57,
      0x45,
      0x42,
      0x50,
    );
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns'))).toBeNull();
  });

  it('checks size and dimensions', () => {
    expect(
      checkImageUpload({ name: 'a.png', size: 0 }, header()),
    ).toMatchObject({ ok: false });
    expect(
      checkImageUpload({ name: 'a.png', size: 16 * 1024 * 1024 }, header()),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/15 MB/),
    });
    expect(checkImageDimensions('a.png', 0, 10)).toMatch(/couldn’t be read/);
    expect(checkImageDimensions('a.png', 10, 10)).toBeNull();
  });
});
