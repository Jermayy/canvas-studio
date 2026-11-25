import {
  deleteAccount,
  INCOMPLETE_MESSAGE,
  OFFLINE_MESSAGE,
  type DeleteAccountDependencies,
} from '@/modules/account/deleteAccount';
import { createSupabaseCloudFiles } from '@/modules/account/infrastructure/supabaseCloudFiles';
import { AuthError, type Session } from '@/modules/auth/domain/authModel';
import { createLogger } from '@/shared/logger';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { NOW } from '@/test/factories';

const session: Session = {
  userId: 'u1',
  email: 'ann@example.test',
  displayName: 'Ann',
  provider: 'supabase',
  expiresAt: NOW + 1000,
};

function setup(overrides: Partial<DeleteAccountDependencies> = {}) {
  const order: string[] = [];
  const step = (name: string) =>
    vi.fn(() => {
      order.push(name);
      return Promise.resolve();
    });
  const deps: DeleteAccountDependencies = {
    auth: {
      verifyPassword: step('verify'),
      deleteIdentity: step('identity'),
    },
    cloudFiles: {
      deleteAll: vi.fn(() => {
        order.push('files');
        return Promise.resolve(3);
      }),
    },
    closeWorkspace: step('close'),
    deleteLocalData: step('local'),
    isOnline: () => true,
    logger: createLogger({ service: 'test', sink: () => undefined }),
    ...overrides,
  };
  return { deps, order };
}

describe('delete account', () => {
  it('verifies, stops sync, deletes files, the account, then this device’s data', async () => {
    const { deps, order } = setup();
    expect(await deleteAccount(deps, { session, password: 'pw' })).toEqual({
      ok: true,
      localDataRemains: false,
    });
    expect(order).toEqual(['verify', 'close', 'files', 'identity', 'local']);
  });

  it('changes nothing when offline or the password is wrong', async () => {
    const offline = setup({ isOnline: () => false });
    expect(
      await deleteAccount(offline.deps, { session, password: 'pw' }),
    ).toEqual({
      ok: false,
      message: OFFLINE_MESSAGE,
      workspaceClosed: false,
    });
    const wrong = setup();
    vi.mocked(wrong.deps.auth.verifyPassword).mockRejectedValueOnce(
      new AuthError('invalid-credentials'),
    );
    expect(
      await deleteAccount(wrong.deps, { session, password: 'x' }),
    ).toMatchObject({
      ok: false,
      message: 'Email or password is incorrect.',
      workspaceClosed: false,
    });
    vi.mocked(wrong.deps.auth.verifyPassword).mockRejectedValueOnce(
      new Error('?'),
    );
    expect(
      await deleteAccount(wrong.deps, { session, password: 'x' }),
    ).toMatchObject({
      ok: false,
      workspaceClosed: false,
    });
    expect(wrong.order).toEqual([]);
  });

  it('works offline for device-local accounts (nothing in the cloud)', async () => {
    const { deps, order } = setup({ cloudFiles: null, isOnline: () => false });
    expect((await deleteAccount(deps, { session, password: 'pw' })).ok).toBe(
      true,
    );
    expect(order).toEqual(['verify', 'close', 'identity', 'local']);
  });

  it('reports a half-finished delete so the app signs out and the user can retry', async () => {
    const { deps } = setup();
    vi.mocked(deps.auth.deleteIdentity).mockRejectedValueOnce(new Error('rpc'));
    expect(await deleteAccount(deps, { session, password: 'pw' })).toEqual({
      ok: false,
      message: INCOMPLETE_MESSAGE,
      workspaceClosed: true,
    });
  });

  it('still succeeds when only the local copy couldn’t be removed', async () => {
    const { deps } = setup({
      deleteLocalData: () => Promise.reject(new Error('blocked')),
    });
    expect(await deleteAccount(deps, { session, password: 'pw' })).toEqual({
      ok: true,
      localDataRemains: true,
    });
  });
});

describe('Supabase cloud files', () => {
  it('empties every user folder and every share image', async () => {
    const fake = createFakeSupabase();
    fake.bucket.list
      .mockResolvedValueOnce({
        data: [{ name: 'a1' }, { name: 'a2' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    fake.respond({ data: [{ id: 's1' }] }, { data: [] });
    const files = createSupabaseCloudFiles(fake.client, 'u1');
    expect(await files.deleteAll()).toBe(3);
    expect(fake.bucket.remove).toHaveBeenCalledWith(['u1/a1', 'u1/a2']);
    expect(fake.bucket.remove).toHaveBeenCalledWith(['s1.png']);
    expect(fake.raw.storage.from).toHaveBeenCalledWith('workspace-assets');
    expect(fake.raw.storage.from).toHaveBeenCalledWith('design-assets');
  });

  it('stops with context on any failure', async () => {
    const fake = createFakeSupabase();
    const files = createSupabaseCloudFiles(fake.client, 'u1');
    fake.bucket.list.mockResolvedValueOnce({
      data: null,
      error: { message: 'x' },
    });
    await expect(files.deleteAll()).rejects.toThrow(
      'list workspace-assets failed',
    );

    fake.bucket.list.mockResolvedValueOnce({
      data: [{ name: 'a' }],
      error: null,
    });
    fake.bucket.remove.mockResolvedValueOnce({ error: { message: 'y' } });
    await expect(files.deleteAll()).rejects.toThrow(
      'delete workspace-assets failed',
    );

    fake.respond({ error: { message: 'z' } });
    await expect(files.deleteAll()).rejects.toThrow(
      'list workspace_shares failed',
    );

    fake.respond({ data: [{ id: 's1' }] });
    fake.bucket.remove.mockResolvedValueOnce({ error: { message: 'w' } });
    await expect(files.deleteAll()).rejects.toThrow(
      'delete workspace-shares failed',
    );
  });
});
