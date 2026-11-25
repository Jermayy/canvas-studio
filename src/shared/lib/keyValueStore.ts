import type { Logger } from '@/shared/logger';

/**
 * Small synchronous key/value port for per-browser conveniences
 * (preferences, login throttling). Browser storage can be missing or throw
 * (private mode, blocked site data), so the browser adapter logs and
 * degrades to "nothing stored" instead of crashing the app.
 */
export interface KeyValueStore {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
}

export function createMemoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

export function createBrowserKeyValueStore(
  getStorage: () => Storage,
  logger: Logger,
): KeyValueStore {
  const attempt = <T>(
    operation: string,
    key: string,
    run: () => T,
  ): T | null => {
    try {
      return run();
    } catch (error) {
      logger.warn('storage.unavailable', { operation, item: key, error });
      return null;
    }
  };
  return {
    get: (key) => attempt('get', key, () => getStorage().getItem(key)),
    set: (key, value) => {
      attempt('set', key, () => {
        getStorage().setItem(key, value);
      });
    },
    remove: (key) => {
      attempt('remove', key, () => {
        getStorage().removeItem(key);
      });
    },
  };
}
