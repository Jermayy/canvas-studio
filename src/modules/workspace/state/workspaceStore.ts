import type { DesignDocument } from '@/modules/document/domain/schema';
import type {
  AssetMeta,
  AssetStore,
  DocumentStore,
} from '@/modules/workspace/data/stores';
import {
  checkImageDimensions,
  checkImageUpload,
} from '@/modules/workspace/domain/imageUpload';
import type { Logger } from '@/shared/logger';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * The workspace's optimistic cache. Every change lands in memory first, so
 * the UI updates instantly; writes to storage happen behind it (debounced
 * per document) with a visible save state. A failed delete is rolled back;
 * a failed save keeps the edit in memory, shows an error and can be
 * retried, so no work is lost.
 */

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface SaveState {
  status: SaveStatus;
  savedAt: number | null;
  error: string | null;
}

export interface WorkspaceState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string | null;
  /** Records that couldn't be read on load (corrupt or wrong key). */
  skipped: number;
  documents: Readonly<Record<string, DesignDocument>>;
  assets: readonly AssetMeta[];
  saves: Readonly<Record<string, SaveState>>;
  /** False in the sandbox: nothing outlives the tab. */
  persistent: boolean;
  /** Bumped each time a design is replaced by a copy from another device. */
  remoteRevisions: Readonly<Record<string, number>>;
}

export interface WorkspaceActions {
  load: () => Promise<void>;
  createDocument: (document: DesignDocument) => Promise<void>;
  /** Optimistic: in memory now, stored after a short pause in edits. */
  saveDocument: (document: DesignDocument) => void;
  renameDocument: (id: string, name: string) => void;
  removeDocument: (id: string) => Promise<DesignDocument | null>;
  restoreDocument: (document: DesignDocument) => Promise<void>;
  retrySave: (id: string) => Promise<void>;
  /** Writes every pending change now (tab hidden, leaving the editor). */
  flush: () => Promise<void>;
  addImage: (file: File) => Promise<AssetMeta>;
  removeAsset: (id: string) => Promise<void>;
  getAssetBlob: (id: string) => Promise<Blob | null>;
  /** True while an edit is still waiting to be stored. */
  hasUnsavedChanges: (id: string) => boolean;
  /** Sync: store a design from another device (no echo back to sync). */
  applyRemoteDocument: (document: DesignDocument) => Promise<void>;
  /** Sync: drop a design deleted on another device. */
  removeRemoteDocument: (id: string) => Promise<void>;
  /** Sync: store an image downloaded from the cloud. */
  applyRemoteAsset: (meta: AssetMeta, blob: Blob) => Promise<void>;
  dispose: () => void;
}

export type WorkspaceStore = StoreApi<WorkspaceState & WorkspaceActions>;

export interface WorkspaceDependencies {
  documents: DocumentStore;
  assets: AssetStore;
  logger: Logger;
  persistent: boolean;
  now: () => number;
  createId: () => string;
  readImageSize: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** Called after a document is safely stored (feeds cloud sync). */
  onPersisted?: (document: DesignDocument) => void;
  /** Called after a document is deleted from storage. */
  onRemoved?: (id: string) => void;
  onAssetAdded?: (id: string) => void;
  onAssetRemoved?: (id: string) => void;
  saveDelayMs?: number;
}

export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

const SAVED: SaveState = { status: 'saved', savedAt: null, error: null };

function omit<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([entry]) => entry !== key),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Browser storage is full. Free up space or delete old designs.';
  }
  return 'Couldn’t save to this browser’s storage.';
}

export function createWorkspaceStore(
  deps: WorkspaceDependencies,
): WorkspaceStore {
  const delay = deps.saveDelayMs ?? 400;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<string, Promise<void>>();

  return createStore<WorkspaceState & WorkspaceActions>()((set, get) => {
    const setSave = (id: string, save: Partial<SaveState>) => {
      set((state) => ({
        saves: {
          ...state.saves,
          [id]: { ...(state.saves[id] ?? SAVED), ...save },
        },
      }));
    };

    const write = async (id: string): Promise<void> => {
      timers.delete(id);
      const document = get().documents[id];
      if (!document) {
        return;
      }
      setSave(id, { status: 'saving', error: null });
      try {
        await deps.documents.put(document);
        // A newer edit may have arrived while writing; it has its own timer.
        if (get().documents[id] === document && !timers.has(id)) {
          setSave(id, { status: 'saved', savedAt: deps.now(), error: null });
        }
        deps.onPersisted?.(document);
      } catch (error) {
        deps.logger.error('workspace.save_failed', { documentId: id, error });
        setSave(id, { status: 'error', error: errorMessage(error) });
      }
    };

    const writeNow = (id: string): Promise<void> => {
      const timer = timers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      const previous = inFlight.get(id) ?? Promise.resolve();
      const next = previous.then(() => write(id));
      inFlight.set(id, next);
      return next;
    };

    const schedule = (id: string) => {
      const existing = timers.get(id);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      timers.set(
        id,
        setTimeout(() => {
          void writeNow(id);
        }, delay),
      );
    };

    return {
      status: 'idle',
      loadError: null,
      skipped: 0,
      documents: {},
      assets: [],
      saves: {},
      persistent: deps.persistent,
      remoteRevisions: {},

      load: async () => {
        set({ status: 'loading', loadError: null });
        try {
          const [{ documents, skipped }, assets] = await Promise.all([
            deps.documents.list(),
            deps.assets.list(),
          ]);
          set({
            status: 'ready',
            documents: Object.fromEntries(
              documents.map((document) => [document.id, document]),
            ),
            assets,
            skipped,
          });
          deps.logger.info('workspace.loaded', {
            documents: documents.length,
            skipped,
          });
        } catch (error) {
          deps.logger.error('workspace.load_failed', { error });
          set({
            status: 'error',
            loadError: 'Your designs couldn’t be loaded from this browser.',
          });
        }
      },

      createDocument: async (document) => {
        set((state) => ({
          documents: { ...state.documents, [document.id]: document },
        }));
        await writeNow(document.id);
      },

      saveDocument: (document) => {
        const stamped = {
          ...document,
          updatedAt: new Date(deps.now()).toISOString(),
        };
        set((state) => ({
          documents: { ...state.documents, [document.id]: stamped },
        }));
        setSave(document.id, { status: 'pending', error: null });
        schedule(document.id);
      },

      renameDocument: (id, name) => {
        const document = get().documents[id];
        const trimmed = name.trim().slice(0, 120);
        if (!document || !trimmed || trimmed === document.name) {
          return;
        }
        get().saveDocument({ ...document, name: trimmed });
      },

      removeDocument: async (id) => {
        const document = get().documents[id];
        if (!document) {
          return null;
        }
        const timer = timers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(id);
        }
        set((state) => ({
          documents: omit(state.documents, id),
          saves: omit(state.saves, id),
        }));
        try {
          await deps.documents.remove(id);
          deps.onRemoved?.(id);
          return document;
        } catch (error) {
          deps.logger.error('workspace.delete_failed', {
            documentId: id,
            error,
          });
          set((state) => ({
            documents: { ...state.documents, [id]: document },
          }));
          throw error;
        }
      },

      restoreDocument: async (document) => {
        await get().createDocument(document);
      },

      retrySave: (id) => writeNow(id),

      flush: async () => {
        await Promise.all([...timers.keys()].map(writeNow));
        await Promise.all(inFlight.values());
      },

      addImage: async (file) => {
        const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        const check = checkImageUpload(file, header);
        if (!check.ok) {
          throw new UploadRejectedError(check.message);
        }
        let size: { width: number; height: number };
        try {
          size = await deps.readImageSize(file);
        } catch (error) {
          deps.logger.warn('workspace.image_unreadable', { error });
          throw new UploadRejectedError(
            `${file.name} couldn’t be read as an image.`,
          );
        }
        const dimensionProblem = checkImageDimensions(
          file.name,
          size.width,
          size.height,
        );
        if (dimensionProblem) {
          throw new UploadRejectedError(dimensionProblem);
        }
        const meta: AssetMeta = {
          id: deps.createId(),
          name: file.name.slice(0, 120),
          mimeType: check.mimeType,
          width: size.width,
          height: size.height,
          size: file.size,
          createdAt: new Date(deps.now()).toISOString(),
        };
        await deps.assets.put(meta, new Blob([file], { type: check.mimeType }));
        set((state) => ({ assets: [meta, ...state.assets] }));
        deps.onAssetAdded?.(meta.id);
        return meta;
      },

      removeAsset: async (id) => {
        await deps.assets.remove(id);
        set((state) => ({
          assets: state.assets.filter((asset) => asset.id !== id),
        }));
        deps.onAssetRemoved?.(id);
      },

      getAssetBlob: (id) => deps.assets.get(id),

      hasUnsavedChanges: (id) => {
        const status = get().saves[id]?.status;
        return timers.has(id) || (status !== undefined && status !== 'saved');
      },

      applyRemoteDocument: async (document) => {
        await deps.documents.put(document);
        set((state) => ({
          documents: { ...state.documents, [document.id]: document },
          saves: {
            ...state.saves,
            [document.id]: {
              status: 'saved',
              savedAt: deps.now(),
              error: null,
            },
          },
          remoteRevisions: {
            ...state.remoteRevisions,
            [document.id]: (state.remoteRevisions[document.id] ?? 0) + 1,
          },
        }));
      },

      removeRemoteDocument: async (id) => {
        const timer = timers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(id);
        }
        await deps.documents.remove(id);
        set((state) => ({
          documents: omit(state.documents, id),
          saves: omit(state.saves, id),
          remoteRevisions: {
            ...state.remoteRevisions,
            [id]: (state.remoteRevisions[id] ?? 0) + 1,
          },
        }));
      },

      applyRemoteAsset: async (meta, blob) => {
        await deps.assets.put(meta, blob);
        set((state) =>
          state.assets.some((asset) => asset.id === meta.id)
            ? state
            : { assets: [meta, ...state.assets] },
        );
      },

      dispose: () => {
        for (const timer of timers.values()) {
          clearTimeout(timer);
        }
        timers.clear();
      },
    };
  });
}
