import { requestPersistentStorage } from '@/modules/workspace/data/storagePersistence';

describe('requestPersistentStorage', () => {
  it('reports already-persisted storage without asking again', async () => {
    const persist = vi.fn(() => Promise.resolve(true));

    await expect(
      requestPersistentStorage({
        persisted: () => Promise.resolve(true),
        persist,
      }),
    ).resolves.toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks the browser and reports its answer', async () => {
    const persisted = () => Promise.resolve(false);

    await expect(
      requestPersistentStorage({
        persisted,
        persist: () => Promise.resolve(true),
      }),
    ).resolves.toBe('persisted');
    await expect(
      requestPersistentStorage({
        persisted,
        persist: () => Promise.resolve(false),
      }),
    ).resolves.toBe('best-effort');
  });

  it('copes with missing or failing APIs', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(
      'unsupported',
    );
    await expect(requestPersistentStorage({})).resolves.toBe('unsupported');
    await expect(
      requestPersistentStorage({
        persisted: () => Promise.reject(new Error('denied')),
        persist: () => Promise.resolve(true),
      }),
    ).resolves.toBe('best-effort');
  });
});
