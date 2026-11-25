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
    ...(row.rev === undefined ? {} : { rev: row.rev }),
    ...(row.copiedFor === undefined ? {} : { copiedFor: row.copiedFor }),
  };
}

function toRow(record: DesignSyncRecord): SyncDesignRow {
  return {
    id: record.id,
    version: record.version,
    dirty: record.dirty ? 1 : 0,
    deleted: record.deleted ? 1 : 0,
    ...(record.rev === undefined ? {} : { rev: record.rev }),
    ...(record.copiedFor === undefined ? {} : { copiedFor: record.copiedFor }),
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
    listDesignIds: () => db.syncDesigns.toCollection().primaryKeys(),
    setAsset: async (record) => {
      await db.syncAssets.put(record);
    },
    settleAsset: (id, state) =>
      db.transaction('rw', db.syncAssets, async () => {
        if ((await db.syncAssets.get(id))?.state !== state) {
          return;
        }
        if (state === 'upload') {
          await db.syncAssets.put({ id, state: 'synced' });
        } else {
          await db.syncAssets.delete(id);
        }
      }),
    listPendingAssets: async () =>
      (await db.syncAssets.toArray()).filter(
        (record) => record.state !== 'synced',
      ),
    listAssetIds: () => db.syncAssets.toCollection().primaryKeys(),
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
