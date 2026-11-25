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
  /** Bumped by every local save, so a pass can tell if one landed meanwhile. */
  rev?: number;
  /** Server version a conflict copy was already made for (no duplicates on retry). */
  copiedFor?: number;
}

/** `synced` records stay, so reconciliation knows the image is in the cloud. */
export type AssetSyncState = 'upload' | 'delete' | 'synced';

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
  /** Every design with a record (reconciliation). */
  listDesignIds: () => Promise<string[]>;
  setAsset: (record: AssetSyncRecord) => Promise<void>;
  /**
   * Finishes a pending upload (→ `synced`) or delete (record removed), only
   * if the record is still in `state`: a newer mark wins.
   */
  settleAsset: (id: string, state: 'upload' | 'delete') => Promise<void>;
  /** Uploads and deletes still to do. */
  listPendingAssets: () => Promise<AssetSyncRecord[]>;
  /** Every image with a record, synced or not (reconciliation). */
  listAssetIds: () => Promise<string[]>;
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
    listDesignIds: () => Promise.resolve([...designs.keys()]),
    setAsset: (record) => {
      assets.set(record.id, record);
      return Promise.resolve();
    },
    settleAsset: (id, state) => {
      if (assets.get(id)?.state === state) {
        if (state === 'upload') {
          assets.set(id, { id, state: 'synced' });
        } else {
          assets.delete(id);
        }
      }
      return Promise.resolve();
    },
    listPendingAssets: () =>
      Promise.resolve(
        [...assets.values()].filter((record) => record.state !== 'synced'),
      ),
    listAssetIds: () => Promise.resolve([...assets.keys()]),
    getCursor: () => Promise.resolve(cursor),
    setCursor: (next) => {
      cursor = next;
      return Promise.resolve();
    },
  };
}
