import type { LeaseLockManager } from '@/modules/workspace/infrastructure/workspaceLease';

/**
 * An in-memory Web Locks stand-in with the two behaviours leases use:
 * `ifAvailable` (callback gets null when taken) and `steal` (the current
 * holder's request rejects with AbortError). Share one between several
 * test "tabs".
 */
export function createFakeLockManager(): LeaseLockManager {
  const holders = new Map<string, { abort: (error: Error) => void }>();
  return {
    request: (name, options, callback) =>
      new Promise<void>((resolve, reject) => {
        const existing = holders.get(name);
        if (existing && options.ifAvailable) {
          void callback(null).then(() => {
            resolve();
          }, reject);
          return;
        }
        if (existing && options.steal) {
          const error = new Error('lock stolen');
          error.name = 'AbortError';
          existing.abort(error);
        }
        const entry = { abort: reject };
        holders.set(name, entry);
        void callback({ name }).then(
          () => {
            if (holders.get(name) === entry) {
              holders.delete(name);
            }
            resolve();
          },
          (error: unknown) => {
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      }),
  };
}
