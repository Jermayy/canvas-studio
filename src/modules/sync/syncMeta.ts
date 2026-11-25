import type { PullCursor } from '@/modules/sync/remoteWorkspace';

/**
 * Per-workspace sync bookkeeping, kept next to the encrypted records. It's
 * plaintext on purpose and holds nothing sensitive: ids, server versions,
 * dirty/deleted flags and the pull cursor.
 */

export interface DesignSyncRecord {
  id: string;
  /** Server version this device last saw; 0 = never reached the server. */
  version: number;
  /** A local change the server doesn't have yet. */
  dirty: boolean;
  /** Deleted on this device (or remotely); kept so a restore can resurrect it. */
  deleted: boolean;
}

export type AssetSyncState = 'upload' | 'delete';

export interface AssetSyncRecord {
  id: string;
  state: AssetSyncState;
}

export interface SyncMetaStore {
  getDesign: (id: string) => Promise<DesignSyncRecord | null>;
  /** Atomic read-modify-write, so concurrent marks never lose a version. */
  updateDesign: (
    id: string,
    change: (current: DesignSyncRecord | null) => DesignSyncRecord | null,
  ) => Promise<void>;
  listDirtyDesigns: () => Promise<DesignSyncRecord[]>;
  setAsset: (record: AssetSyncRecord) => Promise<void>;
  /** Clears the record only if it's still in `state` (a newer mark wins). */
  settleAsset: (id: string, state: AssetSyncState) => Promise<void>;
  listPendingAssets: () => Promise<AssetSyncRecord[]>;
  getCursor: () => Promise<PullCursor | null>;
  setCursor: (cursor: PullCursor) => Promise<void>;
}

export function createMemorySyncMetaStore(): SyncMetaStore {
  const designs = new Map<string, DesignSyncRecord>();
  const assets = new Map<string, AssetSyncRecord>();
  let cursor: PullCursor | null = null;
  return {
    getDesign: (id) => Promise.resolve(designs.get(id) ?? null),
    updateDesign: (id, change) => {
      const next = change(designs.get(id) ?? null);
      if (next) {
        designs.set(id, next);
      } else {
        designs.delete(id);
      }
      return Promise.resolve();
    },
    listDirtyDesigns: () =>
      Promise.resolve([...designs.values()].filter((record) => record.dirty)),
    setAsset: (record) => {
      assets.set(record.id, record);
      return Promise.resolve();
    },
    settleAsset: (id, state) => {
      if (assets.get(id)?.state === state) {
        assets.delete(id);
      }
      return Promise.resolve();
    },
    listPendingAssets: () => Promise.resolve([...assets.values()]),
    getCursor: () => Promise.resolve(cursor),
    setCursor: (next) => {
      cursor = next;
      return Promise.resolve();
    },
  };
}
