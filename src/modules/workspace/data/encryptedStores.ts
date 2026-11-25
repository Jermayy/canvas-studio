import { parseDocument } from '@/modules/document/domain/schema';
import {
  isAssetMeta,
  type AssetMeta,
  type AssetStore,
  type DocumentStore,
} from '@/modules/workspace/data/stores';
import {
  openJson,
  sealJson,
  type Cipher,
  type Sealed,
} from '@/shared/crypto/aesGcm';
import type { Logger } from '@/shared/logger';
import Dexie, { type Table } from 'dexie';

/**
 * Encrypted-at-rest workspace storage. Each account gets its own IndexedDB
 * database, and every record (names and dates included) is sealed with the
 * account's data key, so someone with access to the browser profile but not
 * the password sees only ciphertext.
 */

interface SealedRow {
  id: string;
  payload: Sealed;
}

interface SealedAssetRow {
  id: string;
  meta: Sealed;
  bytes: Sealed;
}

/** Sync bookkeeping rows (see `modules/sync/syncMeta.ts`); no secrets. */
export interface SyncDesignRow {
  id: string;
  version: number;
  /** 0/1 so it can be indexed. */
  dirty: 0 | 1;
  deleted: 0 | 1;
}

export interface SyncAssetRow {
  id: string;
  state: 'upload' | 'delete';
}

export interface SyncValueRow {
  key: string;
  value: string;
}

export class WorkspaceDatabase extends Dexie {
  declare documents: Table<SealedRow, string>;
  declare assets: Table<SealedAssetRow, string>;
  declare syncDesigns: Table<SyncDesignRow, string>;
  declare syncAssets: Table<SyncAssetRow, string>;
  declare syncValues: Table<SyncValueRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ documents: 'id', assets: 'id' });
    // Additive: existing workspaces gain empty sync tables.
    this.version(2).stores({
      syncDesigns: 'id, dirty',
      syncAssets: 'id',
      syncValues: 'key',
    });
  }
}

export function workspaceDatabaseName(userId: string): string {
  return `canvas-studio-v2-workspace-${userId}`;
}

export function createEncryptedDocumentStore(
  db: WorkspaceDatabase,
  cipher: Cipher,
  logger: Logger,
): DocumentStore {
  return {
    list: async () => {
      const rows = await db.documents.toArray();
      const documents = [];
      let skipped = 0;
      for (const row of rows) {
        try {
          documents.push(parseDocument(await openJson(cipher, row.payload)));
        } catch (error) {
          skipped += 1;
          logger.error('workspace.document_unreadable', {
            documentId: row.id,
            error,
          });
        }
      }
      return { documents, skipped };
    },
    put: async (document) => {
      await db.documents.put({
        id: document.id,
        payload: await sealJson(cipher, document),
      });
    },
    remove: async (id) => {
      await db.documents.delete(id);
    },
  };
}

export function createEncryptedAssetStore(
  db: WorkspaceDatabase,
  cipher: Cipher,
  logger: Logger,
): AssetStore {
  const readMeta = async (row: SealedAssetRow): Promise<AssetMeta | null> => {
    try {
      const meta = await openJson(cipher, row.meta);
      return isAssetMeta(meta) ? meta : null;
    } catch (error) {
      logger.error('workspace.asset_unreadable', { assetId: row.id, error });
      return null;
    }
  };
  return {
    list: async () => {
      const metas = await Promise.all(
        (await db.assets.toArray()).map(readMeta),
      );
      return metas.filter((meta): meta is AssetMeta => meta !== null);
    },
    get: async (id) => {
      const row = await db.assets.get(id);
      if (!row) {
        return null;
      }
      const meta = await readMeta(row);
      if (!meta) {
        return null;
      }
      return new Blob([await cipher.open(row.bytes)], { type: meta.mimeType });
    },
    put: async (meta, blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await db.assets.put({
        id: meta.id,
        meta: await sealJson(cipher, meta),
        bytes: await cipher.seal(bytes),
      });
    },
    remove: async (id) => {
      await db.assets.delete(id);
    },
  };
}
