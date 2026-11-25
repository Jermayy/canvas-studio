/**
 * Serialises sync passes across browser tabs.
 *
 * Every tab that has the same account open shares one IndexedDB database.
 * Without coordination, two tabs could push the same dirty design at once:
 * one wins, and the other sees a version conflict and creates a spurious
 * "(conflicted copy)". Holding a Web Lock for each pass means passes never
 * overlap; each pass re-reads the database, so the second tab sees the
 * design already marked clean.
 */

/** The subset of `navigator.locks` we use; injectable for tests. */
export interface LockManagerLike {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
}

export type RunExclusive = <T>(task: () => Promise<T>) => Promise<T>;

export function syncLockName(workspaceId: string): string {
  return `canvas-studio-sync:${workspaceId}`;
}

/**
 * Returns a runner that holds the named lock while a task runs. Browsers
 * without the Web Locks API (very old ones) run tasks directly, which is
 * still safe: conflicts are detected server-side and never lose work.
 */
export function crossTabExclusive(
  name: string,
  locks: LockManagerLike | undefined,
): RunExclusive {
  if (!locks) {
    return (task) => task();
  }
  return (task) => locks.request(name, task);
}

/** `navigator.locks` when the browser provides it. */
export function browserLocks(): LockManagerLike | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return undefined;
  }
  const locks = navigator.locks;
  return {
    request: (name, callback) => locks.request(name, callback),
  };
}
