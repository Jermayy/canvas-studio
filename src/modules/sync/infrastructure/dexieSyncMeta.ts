import type { PullCursor } from '@/modules/sync/remoteWorkspace';
import type { DesignSyncRecord, SyncMetaStore } from '@/modules/sync/syncMeta';
import type {
  SyncDesignRow,
  WorkspaceDatabase,
} from '@/modules/workspace/data/encryptedStores';

const CURSOR_KEY = 'pull-cursor';

function fromRow(row: SyncDesignRow): DesignSyncRecord {
  return {
    id: row.id,
    version: row.version,
    dirty: row.dirty === 1,
    deleted: row.deleted === 1,
  };
}

function toRow(record: DesignSyncRecord): SyncDesignRow {
  return {
    id: record.id,
    version: record.version,
    dirty: record.dirty ? 1 : 0,
    deleted: record.deleted ? 1 : 0,
  };
}

function parseCursor(raw: string): PullCursor | null {
  try {
    const value = JSON.parse(raw) as Partial<PullCursor>;
    return typeof value.updatedAt === 'string' && typeof value.id === 'string'
      ? { updatedAt: value.updatedAt, id: value.id }
      : null;
  } catch {
    return null;
  }
}

/** Sync bookkeeping in the workspace's own IndexedDB database. */
export function createDexieSyncMetaStore(db: WorkspaceDatabase): SyncMetaStore {
  return {
    getDesign: async (id) => {
      const row = await db.syncDesigns.get(id);
      return row ? fromRow(row) : null;
    },
    updateDesign: (id, change) =>
      // A transaction makes this atomic across tabs sharing the database.
      db.transaction('rw', db.syncDesigns, async () => {
        const row = await db.syncDesigns.get(id);
        const next = change(row ? fromRow(row) : null);
        if (next) {
          await db.syncDesigns.put(toRow(next));
        } else {
          await db.syncDesigns.delete(id);
        }
      }),
    listDirtyDesigns: async () =>
      (await db.syncDesigns.where('dirty').equals(1).toArray()).map(fromRow),
    setAsset: async (record) => {
      await db.syncAssets.put(record);
    },
    settleAsset: (id, state) =>
      db.transaction('rw', db.syncAssets, async () => {
        if ((await db.syncAssets.get(id))?.state === state) {
          await db.syncAssets.delete(id);
        }
      }),
    listPendingAssets: () => db.syncAssets.toArray(),
    getCursor: async () => {
      const row = await db.syncValues.get(CURSOR_KEY);
      return row ? parseCursor(row.value) : null;
    },
    setCursor: async (cursor) => {
      await db.syncValues.put({
        key: CURSOR_KEY,
        value: JSON.stringify(cursor),
      });
    },
  };
}
