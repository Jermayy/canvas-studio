import {
  browserLocks,
  crossTabExclusive,
  syncLockName,
} from '@/modules/sync/crossTabLock';

describe('crossTabExclusive', () => {
  it('runs each task inside the named lock', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) =>
      callback(),
    );
    const run = crossTabExclusive(syncLockName('user-1'), {
      request: request as never,
    });

    await expect(run(() => Promise.resolve(42))).resolves.toBe(42);
    expect(request).toHaveBeenCalledWith(
      'canvas-studio-sync:user-1',
      expect.any(Function),
    );
  });

  it('runs tasks directly when the browser has no Web Locks API', async () => {
    const run = crossTabExclusive('x', undefined);

    await expect(run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('propagates task failures', async () => {
    const run = crossTabExclusive('x', {
      request: (_name, callback) => callback(),
    });

    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
  });
});

describe('browserLocks', () => {
  it('is undefined where navigator.locks is missing', () => {
    // jsdom does not implement the Web Locks API.
    expect('locks' in navigator).toBe(false);
    expect(browserLocks()).toBeUndefined();
  });

  it('delegates to navigator.locks when available', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) =>
      callback(),
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });
    try {
      await expect(
        browserLocks()?.request('n', () => Promise.resolve(1)),
      ).resolves.toBe(1);
      expect(request).toHaveBeenCalledWith('n', expect.any(Function));
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
});
