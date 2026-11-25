import type { Logger } from '@/shared/logger';

/**
 * One active tab per account (ADR 0012). Each signed-in workspace holds a
 * Web Lock named after the account; a second tab finds it taken and offers
 * to take over, which pauses the first tab. With a single writer, a tab can
 * never push a stale in-memory copy over another tab's newer work.
 */

/** The slice of `navigator.locks` used here; injectable for tests. */
export interface LeaseLockManager {
  request: (
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<void>;
}

export type LeaseResult =
  | { kind: 'held'; release: () => void }
  /** Another tab holds the account. */
  | { kind: 'busy' };

export interface WorkspaceLeases {
  acquire: (
    userId: string,
    options: {
      /** Take over from the tab that holds it (it's told via `onLost`). */
      steal: boolean;
      /** Another tab took over this lease. */
      onLost: () => void;
    },
  ) => Promise<LeaseResult>;
}

export function leaseName(userId: string): string {
  return `canvas-studio-workspace:${userId}`;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createWorkspaceLeases(
  locks: LeaseLockManager | undefined,
  logger: Logger,
): WorkspaceLeases {
  return {
    acquire: (userId, { steal, onLost }) => {
      if (!locks) {
        // Very old browsers: no coordination, as before.
        return Promise.resolve({ kind: 'held', release: () => undefined });
      }
      return new Promise((resolve) => {
        let release: () => void = () => undefined;
        const held = new Promise<void>((done) => {
          release = done;
        });
        locks
          .request(
            leaseName(userId),
            steal ? { steal: true } : { ifAvailable: true },
            async (lock) => {
              if (lock === null) {
                resolve({ kind: 'busy' });
                return;
              }
              resolve({ kind: 'held', release });
              await held;
            },
          )
          .catch((error: unknown) => {
            if (isAbort(error)) {
              // Stolen by another tab.
              onLost();
              return;
            }
            logger.error('workspace.lease_failed', { error });
            resolve({ kind: 'held', release: () => undefined });
          });
      });
    },
  };
}

/** `navigator.locks` when the browser provides it. */
export function browserLeaseLocks(): LeaseLockManager | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return undefined;
  }
  const locks = navigator.locks;
  return {
    request: (name, options, callback) =>
      locks.request(name, options, callback),
  };
}
