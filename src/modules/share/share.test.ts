import {
  buildShareUrl,
  parseShareId,
  shareImageScale,
} from '@/modules/share/domain/shareLink';
import {
  createSupabaseShareStore,
  shareImagePath,
} from '@/modules/share/infrastructure/supabaseShareStore';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { makeDocument } from '@/test/factories';

const SHARE_ID = '5aaaaaaa-0000-4000-8000-000000000001';
const ROW = {
  id: SHARE_ID,
  title: 'Gala',
  width: 1080,
  height: 1350,
  updated_at: '2026-11-01T00:00:00Z',
};
const INPUT = {
  designId: 'd1',
  title: 'Gala',
  width: 1080,
  height: 1350,
  png: new Blob(['png'], { type: 'image/png' }),
};

describe('share links', () => {
  it('builds and validates links', () => {
    expect(buildShareUrl('https://app.test', SHARE_ID)).toBe(
      `https://app.test/s/${SHARE_ID}`,
    );
    expect(parseShareId(SHARE_ID.toUpperCase())).toBe(SHARE_ID);
    expect(parseShareId('not-a-uuid')).toBeNull();
  });

  it('shares small designs at 2× and large ones at actual size', () => {
    const at = (width: number, height: number) =>
      shareImageScale(makeDocument({ format: { id: 'x', width, height } }));
    expect(at(1080, 1200)).toBe(2);
    expect(at(1000, 2000)).toBe(1);
  });
});

describe('Supabase share store', () => {
  function setup() {
    const fake = createFakeSupabase();
    return { ...fake, shares: createSupabaseShareStore(fake.client) };
  }

  it('reads the current share of a design', async () => {
    const { shares, respond, calls } = setup();
    respond({ data: ROW }, { data: null });
    expect(await shares.getForDesign('d1')).toMatchObject({ id: SHARE_ID });
    expect(await shares.getForDesign('d2')).toBeNull();
    expect(calls[0]?.table).toBe('workspace_shares');
  });

  it('creates the row before uploading the image (storage policies need it)', async () => {
    const { shares, respond, bucket } = setup();
    respond({ data: null }, { data: ROW });
    expect(await shares.publish(INPUT)).toMatchObject({ id: SHARE_ID });
    expect(bucket.upload).toHaveBeenCalledWith(
      shareImagePath(SHARE_ID),
      INPUT.png,
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    );
  });

  it('removes a brand-new link when its image fails, but keeps an existing one', async () => {
    const { shares, respond, bucket, chainOf } = setup();
    bucket.upload.mockResolvedValue({ error: { message: 'quota' } });
    respond({ data: null }, { data: ROW }, { data: null });
    await expect(shares.publish(INPUT)).rejects.toThrow(
      'upload share image failed: quota',
    );
    expect(chainOf(2)).toEqual(['delete', 'eq']);

    respond({ data: ROW }, { data: ROW });
    await expect(shares.publish(INPUT)).rejects.toThrow();
    expect(chainOf(5)).toEqual([]);
  });

  it('turns a link off image first, and does nothing when not shared', async () => {
    const { shares, respond, bucket, chainOf } = setup();
    respond({ data: null });
    await shares.unpublish('d1');
    expect(bucket.remove).not.toHaveBeenCalled();

    respond({ data: ROW }, { data: null });
    await shares.unpublish('d1');
    expect(bucket.remove).toHaveBeenCalledWith([`${SHARE_ID}.png`]);
    expect(chainOf(2)).toEqual(['delete', 'eq']);

    bucket.remove.mockResolvedValueOnce({ error: { message: 'denied' } });
    respond({ data: ROW });
    await expect(shares.unpublish('d1')).rejects.toThrow(
      'delete share image failed',
    );
  });

  it('reads public shares by exact token with a cache-busted image URL', async () => {
    const { shares, respond, raw } = setup();
    respond({ data: [ROW] }, { data: [] }, { error: { message: 'down' } });
    const view = await shares.fetchShared(SHARE_ID);
    expect(raw.rpc).toHaveBeenCalledWith('get_workspace_share', {
      share_id: SHARE_ID,
    });
    expect(view?.imageUrl).toBe(
      `https://cloud.example.test/public/${SHARE_ID}.png?v=2026-11-01T00%3A00%3A00Z`,
    );
    expect(await shares.fetchShared(SHARE_ID)).toBeNull();
    await expect(shares.fetchShared(SHARE_ID)).rejects.toThrow(
      'load shared design failed',
    );
  });

  it('surfaces query errors', async () => {
    const { shares, respond } = setup();
    respond(
      { error: { message: 'x' } },
      { data: null },
      { error: { message: 'y' } },
    );
    await expect(shares.getForDesign('d1')).rejects.toThrow(
      'load share failed',
    );
    await expect(shares.publish(INPUT)).rejects.toThrow('create share failed');
  });
});
