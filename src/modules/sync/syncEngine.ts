import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  openAsset,
  openDocument,
  referencedAssetIds,
  sealAsset,
  sealDocument,
} from '@/modules/sync/envelope';
import type {
  PullCursor,
  RealtimeStatus,
  RemoteDesign,
  RemoteDesignWrite,
  RemoteWorkspace,
} from '@/modules/sync/remoteWorkspace';
import type { DesignSyncRecord, SyncMetaStore } from '@/modules/sync/syncMeta';
import type { AssetMeta } from '@/modules/workspace/data/stores';
import type { Cipher } from '@/shared/crypto/aesGcm';
import type { Logger } from '@/shared/logger';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Keeps an encrypted workspace and its cloud copy in step (ADR 0012).
 *
 * - Local saves mark a design dirty; dirty designs are sealed and pushed
 *   with optimistic concurrency (the expected server version).
 * - Remote changes are pulled by a keyset cursor on server time, opened
 *   and validated, then applied to the workspace.
 * - On a conflict the server copy wins and the local edit is kept as a
 *   separate "(conflicted copy)" design, so no work is lost.
 * - Realtime triggers pulls; polling covers missed events. Failures back
 *   off exponentially; going offline pauses until the connection returns.
 * - One pass at a time across tabs (`runExclusive`), so two tabs never
 *   push the same design and create a spurious conflict.
 *
 * The server only ever receives ciphertext.
 */

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** Designs and images waiting to upload. */
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Realtime connected: other devices' changes arrive within seconds. */
  live: boolean;
}

/** What the engine needs from the workspace it syncs. */
export interface SyncTarget {
  getDocument: (id: string) => DesignDocument | undefined;
  /** True while an edit is still waiting to be stored on this device. */
  hasUnsavedChanges: (id: string) => boolean;
  /** Stores a pulled design without echoing it back as a local change. */
  applyRemoteDocument: (document: DesignDocument) => Promise<void>;
  removeRemoteDocument: (id: string) => Promise<void>;
  /** Saves `document` under a new id as "(conflicted copy)". */
  createConflictCopy: (document: DesignDocument) => Promise<void>;
  hasAsset: (id: string) => boolean;
  getAsset: (id: string) => Promise<{ meta: AssetMeta; blob: Blob } | null>;
  applyRemoteAsset: (meta: AssetMeta, blob: Blob) => Promise<void>;
}

export interface Connectivity {
  isOnline: () => boolean;
  subscribe: (onChange: () => void) => () => void;
}

export interface SyncEngine {
  store: StoreApi<SyncState>;
  /** Begins realtime, polling and a first full sync. */
  start: () => void;
  /** A design was stored on this device. */
  enqueue: (document: DesignDocument) => void;
  /** A design was deleted on this device. */
  markDeleted: (id: string) => void;
  assetAdded: (id: string) => void;
  assetRemoved: (id: string) => void;
  /** Runs a full pass now (resolves when done; never rejects). */
  syncNow: () => Promise<void>;
  retryNow: () => void;
  /** Stops everything; resolves once pending bookkeeping is stored. */
  dispose: () => Promise<void>;
}

export function browserConnectivity(target: Window = window): Connectivity {
  return {
    isOnline: () => target.navigator.onLine,
    subscribe: (onChange) => {
      target.addEventListener('online', onChange);
      target.addEventListener('offline', onChange);
      return () => {
        target.removeEventListener('online', onChange);
        target.removeEventListener('offline', onChange);
      };
    },
  };
}

export interface SyncEngineDependencies {
  remote: RemoteWorkspace;
  meta: SyncMetaStore;
  target: SyncTarget;
  cipher: Cipher;
  connectivity: Connectivity;
  logger: Logger;
  now: () => number;
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
  debounceMs?: number;
  pollIntervalMs?: number;
  retryBaseMs?: number;
  maxRetryMs?: number;
  pageSize?: number;
}

export const CONFLICT_SUFFIX = ' (conflicted copy)';
/** A transaction that started earlier can commit later; re-read a little. */
const CURSOR_OVERLAP_MS = 5_000;

export class RemoteDesignUnreadableError extends Error {
  constructor(readonly designId: string) {
    super(
      'A design in the cloud couldn’t be opened. Reload to update the app.',
    );
    this.name = 'RemoteDesignUnreadableError';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Sync failed';
}

export function createSyncEngine(deps: SyncEngineDependencies): SyncEngine {
  const { remote, meta, target, cipher, connectivity, logger } = deps;
  const debounceMs = deps.debounceMs ?? 1_000;
  const pollIntervalMs = deps.pollIntervalMs ?? 30_000;
  const retryBase = deps.retryBaseMs ?? 2_000;
  const maxRetry = deps.maxRetryMs ?? 60_000;
  const pageSize = deps.pageSize ?? 100;
  const runExclusive = deps.runExclusive ?? ((task) => task());

  const store = createStore<SyncState>()(() => ({
    status: connectivity.isOnline() ? 'syncing' : 'offline',
    pending: 0,
    lastSyncedAt: null,
    lastError: null,
    live: false,
  }));

  let disposed = false;
  let started = false;
  let running: Promise<void> | null = null;
  let rerun = false;
  let attempt = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const cleanups: (() => void)[] = [];

  // Bookkeeping writes run in order, so a mark never overtakes another.
  let marks: Promise<void> = Promise.resolve();
  const mark = (task: () => Promise<void>): Promise<void> => {
    marks = marks.then(task).catch((error: unknown) => {
      logger.error('sync.mark_failed', { error });
    });
    return marks;
  };

  const refreshPending = async () => {
    const [designs, assets] = await Promise.all([
      meta.listDirtyDesigns(),
      meta.listPendingAssets(),
    ]);
    store.setState({ pending: designs.length + assets.length });
  };

  const requestSync = (delay = debounceMs) => {
    if (disposed || !started) {
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void syncNow();
    }, delay);
  };

  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    const wait = Math.min(maxRetry, retryBase * 2 ** attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      void syncNow();
    }, wait);
  };

  // ---- push ---------------------------------------------------------------

  const pushAssets = async () => {
    for (const record of await meta.listPendingAssets()) {
      if (record.state === 'delete') {
        await remote.deleteAsset(record.id);
      } else {
        const asset = await target.getAsset(record.id);
        if (asset) {
          await remote.uploadAsset(
            record.id,
            await sealAsset(cipher, asset.meta, asset.blob),
          );
        }
      }
      await mark(() => meta.settleAsset(record.id, record.state));
    }
  };

  const writeFor = async (
    record: DesignSyncRecord,
    document: DesignDocument | undefined,
  ): Promise<RemoteDesignWrite | null> => {
    if (record.deleted) {
      const at = new Date(deps.now()).toISOString();
      return {
        id: record.id,
        payload: null,
        clientUpdatedAt: at,
        deletedAt: at,
      };
    }
    if (!document) {
      return null;
    }
    return {
      id: document.id,
      payload: await sealDocument(cipher, document),
      clientUpdatedAt: document.updatedAt,
      deletedAt: null,
    };
  };

  const pushDesign = async (record: DesignSyncRecord) => {
    if (record.deleted && record.version === 0) {
      // Never reached the server: nothing to tell it.
      await mark(() =>
        meta.updateDesign(record.id, (current) =>
          current?.deleted ? null : current,
        ),
      );
      return;
    }
    const document = target.getDocument(record.id);
    const write = await writeFor(record, document);
    if (!write) {
      // Dirty but gone from the workspace: the delete mark will follow.
      return;
    }
    const saved =
      record.version === 0
        ? await remote.insert(write)
        : await remote.update(write, record.version);
    if (!saved) {
      await resolveConflict(record);
      return;
    }
    await mark(() =>
      meta.updateDesign(record.id, (current) => {
        const deleted = current?.deleted ?? record.deleted;
        // Still dirty if it changed (or was restored/deleted) mid-push.
        const changed = record.deleted
          ? !deleted
          : deleted || target.getDocument(record.id) !== document;
        return {
          id: record.id,
          version: saved.version,
          dirty: changed,
          deleted,
        };
      }),
    );
  };

  // ---- pull ---------------------------------------------------------------

  const downloadMissingAssets = async (document: DesignDocument) => {
    for (const id of referencedAssetIds(document)) {
      if (target.hasAsset(id)) {
        continue;
      }
      const envelope = await remote.downloadAsset(id);
      if (envelope === null) {
        logger.warn('sync.asset_missing', { assetId: id });
        continue;
      }
      try {
        const { meta: assetMeta, blob } = await openAsset(cipher, envelope);
        await target.applyRemoteAsset(assetMeta, blob);
      } catch (error) {
        logger.error('sync.asset_unreadable', { assetId: id, error });
      }
    }
  };

  const openRemote = async (
    design: RemoteDesign,
  ): Promise<DesignDocument | null> => {
    if (!design.payload) {
      return null;
    }
    try {
      const document = await openDocument(cipher, design.payload);
      if (document.id !== design.id) {
        throw new Error('design id mismatch');
      }
      return document;
    } catch (error) {
      logger.error('sync.remote_unreadable', {
        designId: design.id,
        version: design.version,
        error,
      });
      throw new RemoteDesignUnreadableError(design.id);
    }
  };

  const applyRemote = async (design: RemoteDesign) => {
    const settled = (deleted: boolean) =>
      mark(() =>
        meta.updateDesign(design.id, () => ({
          id: design.id,
          version: design.version,
          dirty: false,
          deleted,
        })),
      );
    if (design.deletedAt !== null) {
      await target.removeRemoteDocument(design.id);
      await settled(true);
      return;
    }
    const document = await openRemote(design);
    if (!document) {
      return;
    }
    await downloadMissingAssets(document);
    await target.applyRemoteDocument(document);
    await settled(false);
  };

  /** Server wins; the local edit survives as its own design. */
  async function resolveConflict(local: DesignSyncRecord): Promise<void> {
    const server = await remote.fetchById(local.id);
    logger.warn('sync.conflict', {
      designId: local.id,
      localVersion: local.version,
      remoteVersion: server?.version ?? null,
    });
    // Opened first: an unreadable server copy stops here, before any copy
    // is made, so retries can't pile up duplicates.
    const serverDocument =
      server && server.deletedAt === null ? await openRemote(server) : null;
    const mine = target.getDocument(local.id);
    if (
      mine &&
      !local.deleted &&
      JSON.stringify(serverDocument) !== JSON.stringify(mine)
    ) {
      await target.createConflictCopy(mine);
    }
    if (!server) {
      // The id can't be used remotely; the copy above carries the work.
      await target.removeRemoteDocument(local.id);
      await mark(() => meta.updateDesign(local.id, () => null));
      return;
    }
    await applyRemote(server);
  }

  const rewound = (cursor: PullCursor | null): PullCursor | null => {
    if (!cursor) {
      return null;
    }
    const time = Date.parse(cursor.updatedAt);
    if (Number.isNaN(time)) {
      logger.warn('sync.cursor_reset');
      return null;
    }
    // Already-applied versions are skipped, so re-reading is safe.
    return {
      updatedAt: new Date(time - CURSOR_OVERLAP_MS).toISOString(),
      id: '',
    };
  };

  const applyPulled = async (design: RemoteDesign): Promise<boolean> => {
    const local = await meta.getDesign(design.id);
    if (local && design.version <= local.version) {
      // Our own push echoing back, or already applied.
      return false;
    }
    if (local?.dirty || target.hasUnsavedChanges(design.id)) {
      await resolveConflict(
        local ?? { id: design.id, version: 0, dirty: true, deleted: false },
      );
      return true;
    }
    await applyRemote(design);
    return true;
  };

  const pull = async (): Promise<number> => {
    let cursor = rewound(await meta.getCursor());
    let changed = 0;
    for (;;) {
      const page = await remote.fetchChangedSince(cursor, pageSize);
      for (const design of page) {
        if (await applyPulled(design)) {
          changed += 1;
        }
        cursor = { updatedAt: design.updatedAt, id: design.id };
      }
      if (cursor) {
        await meta.setCursor(cursor);
      }
      if (page.length < pageSize) {
        return changed;
      }
    }
  };

  // ---- passes -------------------------------------------------------------

  const runOnce = async () => {
    await marks;
    if (disposed) {
      return;
    }
    if (!connectivity.isOnline()) {
      store.setState({ status: 'offline' });
      return;
    }
    store.setState({ status: 'syncing', lastError: null });
    const startedAt = deps.now();
    try {
      await pushAssets();
      const dirty = await meta.listDirtyDesigns();
      for (const record of dirty) {
        await pushDesign(record);
      }
      const pulled = await pull();
      attempt = 0;
      store.setState({
        status: 'synced',
        lastSyncedAt: deps.now(),
        lastError: null,
      });
      logger.info('sync.completed', {
        pushed: dirty.length,
        pulled,
        durationMs: deps.now() - startedAt,
      });
    } catch (error) {
      const offline = !connectivity.isOnline();
      logger.warn('sync.failed', { offline, attempt, error });
      store.setState({
        status: offline ? 'offline' : 'error',
        lastError: messageOf(error),
      });
      if (!offline) {
        scheduleRetry();
      }
    } finally {
      await refreshPending();
    }
  };

  const takeRerun = () => {
    const value = rerun;
    rerun = false;
    return value;
  };

  const loop = async () => {
    do {
      await runExclusive(runOnce);
    } while (takeRerun() && !disposed);
  };

  function syncNow(): Promise<void> {
    if (disposed) {
      return Promise.resolve();
    }
    if (running) {
      rerun = true;
      return running;
    }
    running = loop()
      .catch((error: unknown) => {
        logger.error('sync.loop_failed', { error });
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  const afterMark = () => {
    void refreshPending();
    requestSync();
  };

  return {
    store,

    start: () => {
      if (started || disposed) {
        return;
      }
      started = true;
      cleanups.push(
        remote.subscribe(
          () => {
            requestSync(0);
          },
          (status: RealtimeStatus) => {
            const live = status === 'connected';
            store.setState({ live });
            if (live) {
              // Catch up on anything missed while disconnected.
              requestSync(0);
            }
          },
        ),
        connectivity.subscribe(() => {
          if (connectivity.isOnline()) {
            attempt = 0;
            void syncNow();
          } else {
            store.setState({ status: 'offline', live: false });
          }
        }),
      );
      pollTimer = setInterval(() => {
        requestSync(0);
      }, pollIntervalMs);
      void syncNow();
    },

    enqueue: (document) => {
      void mark(() =>
        meta.updateDesign(document.id, (current) => ({
          id: document.id,
          version: current?.version ?? 0,
          dirty: true,
          deleted: false,
        })),
      ).then(afterMark);
    },

    markDeleted: (id) => {
      void mark(() =>
        meta.updateDesign(id, (current) =>
          current ? { ...current, dirty: true, deleted: true } : null,
        ),
      ).then(afterMark);
    },

    assetAdded: (id) => {
      void mark(() => meta.setAsset({ id, state: 'upload' })).then(afterMark);
    },

    assetRemoved: (id) => {
      void mark(() => meta.setAsset({ id, state: 'delete' })).then(afterMark);
    },

    syncNow,

    retryNow: () => {
      attempt = 0;
      clearTimeout(retryTimer);
      void syncNow();
    },

    dispose: async () => {
      disposed = true;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      clearInterval(pollTimer);
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      await marks;
    },
  };
}
