import type { DesignDocument } from '@/modules/document/domain/schema';

/**
 * Storage ports for a workspace. The editor and dashboard only see these;
 * whether data lives encrypted in IndexedDB (signed in) or in memory
 * (sandbox, nothing saved) is decided once at wiring time.
 */

export interface AssetMeta {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
}

/** Shape check for asset metadata read back from storage. */
export function isAssetMeta(value: unknown): value is AssetMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.width === 'number' &&
    typeof record.height === 'number' &&
    typeof record.size === 'number' &&
    typeof record.createdAt === 'string'
  );
}

export interface LoadedDocuments {
  documents: DesignDocument[];
  /** Records that couldn't be decrypted or failed validation. */
  skipped: number;
}

export interface DocumentStore {
  list: () => Promise<LoadedDocuments>;
  put: (document: DesignDocument) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface AssetStore {
  list: () => Promise<AssetMeta[]>;
  get: (id: string) => Promise<Blob | null>;
  put: (meta: AssetMeta, blob: Blob) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function createMemoryDocumentStore(
  initial: readonly DesignDocument[] = [],
): DocumentStore {
  const documents = new Map(initial.map((document) => [document.id, document]));
  return {
    list: () =>
      Promise.resolve({ documents: [...documents.values()], skipped: 0 }),
    put: (document) => {
      documents.set(document.id, document);
      return Promise.resolve();
    },
    remove: (id) => {
      documents.delete(id);
      return Promise.resolve();
    },
  };
}

export function createMemoryAssetStore(): AssetStore {
  const assets = new Map<string, { meta: AssetMeta; blob: Blob }>();
  return {
    list: () =>
      Promise.resolve([...assets.values()].map((entry) => entry.meta)),
    get: (id) => Promise.resolve(assets.get(id)?.blob ?? null),
    put: (meta, blob) => {
      assets.set(meta.id, { meta, blob });
      return Promise.resolve();
    },
    remove: (id) => {
      assets.delete(id);
      return Promise.resolve();
    },
  };
}
