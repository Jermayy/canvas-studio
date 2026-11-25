import { createDexieSyncMetaStore } from '@/modules/sync/infrastructure/dexieSyncMeta';
import {
  createSupabaseRemoteWorkspace,
  rowToRemote,
} from '@/modules/sync/infrastructure/supabaseRemoteWorkspace';
import { WorkspaceDatabase } from '@/modules/workspace/data/encryptedStores';
import { createFakeSupabase } from '@/test/fakeSupabase';

const ROW = {
  id: 'd1',
  ciphertext: 'Y2lwaGVy',
  iv: 'AAAAAAAAAAAAAAAA',
  version: 2,
  client_updated_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
  deleted_at: null,
};

const WRITE = {
  id: 'd1',
  payload: { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'Y2lwaGVy' },
  clientUpdatedAt: '2026-11-01T00:00:00Z',
  deletedAt: null,
};

describe('Supabase remote workspace', () => {
  function setup() {
    const fake = createFakeSupabase();
    return {
      ...fake,
      remote: createSupabaseRemoteWorkspace(fake.client, 'u1'),
    };
  }

  it('maps rows, treating tombstones as having no payload', () => {
    expect(rowToRemote(ROW)).toEqual({
      id: 'd1',
      version: 2,
      payload: { iv: ROW.iv, ciphertext: ROW.ciphertext },
      clientUpdatedAt: ROW.client_updated_at,
      updatedAt: ROW.updated_at,
      deletedAt: null,
    });
    expect(
      rowToRemote({ ...ROW, ciphertext: null, iv: null, deleted_at: 'x' })
        .payload,
    ).toBeNull();
    expect(() => rowToRemote({ id: 1 })).toThrow();
  });

  it('pulls by keyset cursor, inclusive for a rewound cursor', async () => {
    const { remote, respond, chainOf, calls } = setup();
    respond({ data: [ROW] }, { data: [] }, { data: [] });
    expect(await remote.fetchChangedSince(null, 10)).toHaveLength(1);
    expect(chainOf(0)).toEqual(['select', 'order', 'order', 'limit']);
    await remote.fetchChangedSince({ updatedAt: 't', id: '' }, 10);
    expect(chainOf(1)).toContain('gte');
    await remote.fetchChangedSince({ updatedAt: 't"x', id: 'd"1' }, 10);
    const or = calls[2]?.chain.find(([name]) => name === 'or');
    expect(or?.[1][0]).toBe(
      'updated_at.gt."tx",and(updated_at.eq."tx",id.gt."d1")',
    );
    expect(calls[0]?.table).toBe('workspace_designs');
  });

  it('reports version conflicts and duplicate inserts as null', async () => {
    const { remote, respond } = setup();
    respond(
      { data: ROW },
      { error: { message: 'dup', code: '23505' } },
      { data: ROW },
      { data: null },
      { data: null },
    );
    expect(await remote.insert(WRITE)).toMatchObject({ version: 2 });
    expect(await remote.insert(WRITE)).toBeNull();
    expect(await remote.update(WRITE, 1)).toMatchObject({ id: 'd1' });
    expect(await remote.update(WRITE, 1)).toBeNull();
    expect(await remote.fetchById('d1')).toBeNull();
  });

  it('writes the next version only where the expected one still holds', async () => {
    const { remote, respond, calls } = setup();
    respond({ data: ROW }, { data: ROW }, { data: [] });
    await remote.update(WRITE, 4);
    const update = calls[0]?.chain ?? [];
    expect(update.find(([name]) => name === 'update')?.[1][0]).toMatchObject({
      version: 5,
      ciphertext: WRITE.payload.ciphertext,
      iv: WRITE.payload.iv,
      deleted_at: null,
    });
    expect(
      update.filter(([name]) => name === 'eq').map(([, args]) => args),
    ).toEqual([
      ['id', 'd1'],
      ['version', 4],
    ]);
    // Tombstones send no ciphertext.
    await remote.update({ ...WRITE, payload: null, deletedAt: 'now' }, 5);
    expect(
      calls[1]?.chain.find(([name]) => name === 'update')?.[1][0],
    ).toMatchObject({ ciphertext: null, iv: null, deleted_at: 'now' });
    // Keyset order: server time, then id, both ascending.
    await remote.fetchChangedSince(null, 10);
    expect(
      calls[2]?.chain.filter(([name]) => name === 'order').map(([, a]) => a),
    ).toEqual([
      ['updated_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('turns other errors into exceptions with context', async () => {
    const { remote, respond } = setup();
    const error = { message: 'boom' };
    respond({ error }, { error }, { error }, { error });
    await expect(remote.fetchChangedSince(null, 1)).rejects.toThrow(
      'fetch designs failed: boom',
    );
    await expect(remote.fetchById('d1')).rejects.toThrow('fetch design failed');
    await expect(remote.insert(WRITE)).rejects.toThrow('insert design failed');
    await expect(remote.update(WRITE, 1)).rejects.toThrow(
      'update design failed',
    );
  });

  it('stores sealed images under the user’s folder, idempotently', async () => {
    const { remote, bucket } = setup();
    await remote.uploadAsset('a1', '{}');
    expect(bucket.upload).toHaveBeenCalledWith('u1/a1', expect.any(Blob), {
      contentType: 'application/json',
      upsert: false,
    });
    bucket.upload.mockResolvedValueOnce({
      error: { message: 'exists', statusCode: '409' },
    });
    await expect(remote.uploadAsset('a1', '{}')).resolves.toBeUndefined();
    bucket.upload.mockResolvedValueOnce({
      error: { message: 'nope', status: 500 },
    });
    await expect(remote.uploadAsset('a1', '{}')).rejects.toThrow(
      'upload image failed',
    );

    expect(await remote.downloadAsset('a1')).toBe('envelope');
    bucket.download.mockResolvedValueOnce({
      data: null,
      error: { message: 'gone', status: 404 },
    });
    expect(await remote.downloadAsset('a1')).toBeNull();
    bucket.download.mockResolvedValueOnce({
      data: null,
      error: { message: 'down', status: 503 },
    });
    await expect(remote.downloadAsset('a1')).rejects.toThrow(
      'download image failed',
    );

    await remote.deleteAsset('a1');
    expect(bucket.remove).toHaveBeenCalledWith(['u1/a1']);
    bucket.remove.mockResolvedValueOnce({ error: { message: 'denied' } });
    await expect(remote.deleteAsset('a1')).rejects.toThrow(
      'delete image failed',
    );
  });

  it('subscribes to the user’s rows and reports realtime status', () => {
    const { remote, raw, channel } = setup();
    const onChange = vi.fn();
    const onStatus = vi.fn();
    const unsubscribe = remote.subscribe(onChange, onStatus);
    expect(raw.channel).toHaveBeenCalledWith('workspace:u1');
    const [, filter, handler] = channel.on.mock.calls[0] as [
      string,
      { filter: string },
      () => void,
    ];
    expect(filter.filter).toBe('user_id=eq.u1');
    handler();
    expect(onChange).toHaveBeenCalled();
    const [statusHandler] = channel.subscribe.mock.calls[0] as [
      (status: string) => void,
    ];
    statusHandler('SUBSCRIBED');
    statusHandler('CHANNEL_ERROR');
    expect(onStatus.mock.calls).toEqual([['connected'], ['disconnected']]);
    unsubscribe();
    expect(raw.removeChannel).toHaveBeenCalledWith(channel);
  });
});

describe('Dexie sync bookkeeping', () => {
  let counter = 0;
  const open = () => {
    counter += 1;
    return createDexieSyncMetaStore(
      new WorkspaceDatabase(`sync-meta-${counter}`),
    );
  };

  it('keeps design records, dirty listing and atomic updates', async () => {
    const meta = open();
    expect(await meta.getDesign('d1')).toBeNull();
    await meta.updateDesign('d1', () => ({
      id: 'd1',
      version: 0,
      dirty: true,
      deleted: false,
    }));
    await meta.updateDesign('d2', () => ({
      id: 'd2',
      version: 3,
      dirty: false,
      deleted: true,
    }));
    expect((await meta.listDirtyDesigns()).map((record) => record.id)).toEqual([
      'd1',
    ]);
    await meta.updateDesign(
      'd1',
      (current) => current && { ...current, version: 1 },
    );
    expect(await meta.getDesign('d1')).toEqual({
      id: 'd1',
      version: 1,
      dirty: true,
      deleted: false,
    });
    await meta.updateDesign('d2', () => null);
    expect(await meta.getDesign('d2')).toBeNull();
  });

  it('settles an asset only if no newer mark replaced it', async () => {
    const meta = open();
    await meta.setAsset({ id: 'a1', state: 'upload' });
    await meta.setAsset({ id: 'a1', state: 'delete' });
    await meta.settleAsset('a1', 'upload');
    expect(await meta.listPendingAssets()).toEqual([
      { id: 'a1', state: 'delete' },
    ]);
    await meta.settleAsset('a1', 'delete');
    expect(await meta.listPendingAssets()).toEqual([]);
  });

  it('stores the cursor and treats a corrupt one as absent', async () => {
    const db = new WorkspaceDatabase('sync-meta-cursor');
    const meta = createDexieSyncMetaStore(db);
    expect(await meta.getCursor()).toBeNull();
    await meta.setCursor({ updatedAt: 't', id: 'd1' });
    expect(await meta.getCursor()).toEqual({ updatedAt: 't', id: 'd1' });
    await db.syncValues.put({ key: 'pull-cursor', value: '{bad' });
    expect(await meta.getCursor()).toBeNull();
    await db.syncValues.put({ key: 'pull-cursor', value: '{"id":1}' });
    expect(await meta.getCursor()).toBeNull();
  });
});
