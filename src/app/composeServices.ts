import type { AppConfig } from '@/app/config';
import type { AppServices, Workspace } from '@/app/services';
import { deleteAccount } from '@/modules/account/deleteAccount';
import { createSupabaseCloudFiles } from '@/modules/account/infrastructure/supabaseCloudFiles';
import { createAuthService } from '@/modules/auth/application/authService';
import { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  createIndexedDbSessionVault,
  createKeyring,
} from '@/modules/auth/infrastructure/keyring';
import { createLocalIdentityProvider } from '@/modules/auth/infrastructure/localIdentityProvider';
import { createSupabaseIdentityProvider } from '@/modules/auth/infrastructure/supabaseIdentityProvider';
import {
  createLocalWrappedKeyStore,
  createSupabaseWrappedKeyStore,
  withLocalFallback,
} from '@/modules/auth/infrastructure/wrappedKeyStores';
import {
  blobToDataUrl,
  canvasRasterizer,
  jsPdfWriter,
  readImageSize,
} from '@/modules/export/infrastructure/browserEncoders';
import {
  browserDeliveryEnvironment,
  createFileDelivery,
} from '@/modules/export/infrastructure/fileDelivery';
import { createPreferencesStore } from '@/modules/preferences/preferences';
import { createSupabaseShareStore } from '@/modules/share/infrastructure/supabaseShareStore';
import {
  browserLocks,
  crossTabExclusive,
  syncLockName,
} from '@/modules/sync/crossTabLock';
import { createDexieSyncMetaStore } from '@/modules/sync/infrastructure/dexieSyncMeta';
import { createSupabaseRemoteWorkspace } from '@/modules/sync/infrastructure/supabaseRemoteWorkspace';
import {
  browserConnectivity,
  createSyncEngine,
  type SyncEngine,
} from '@/modules/sync/syncEngine';
import { workspaceSyncTarget } from '@/modules/sync/workspaceTarget';
import {
  createEncryptedAssetStore,
  createEncryptedDocumentStore,
  WorkspaceDatabase,
  workspaceDatabaseName,
} from '@/modules/workspace/data/encryptedStores';
import {
  createMemoryAssetStore,
  createMemoryDocumentStore,
} from '@/modules/workspace/data/stores';
import {
  createWorkspaceStore,
  type WorkspaceStore,
} from '@/modules/workspace/state/workspaceStore';
import { createAesGcmCipher } from '@/shared/crypto/aesGcm';
import {
  browserLeaseLocks,
  createWorkspaceLeases,
} from '@/modules/workspace/infrastructure/workspaceLease';
import { createId } from '@/shared/lib/ids';
import { createBrowserKeyValueStore } from '@/shared/lib/keyValueStore';
import type { Logger } from '@/shared/logger';
import { createToastStore } from '@/shared/ui/toastStore';
import Dexie from 'dexie';

/** Starts sync once the workspace has loaded, so pulls merge into it. */
function startWhenReady(store: WorkspaceStore, sync: SyncEngine) {
  const unsubscribe = store.subscribe((state) => {
    if (state.status === 'ready') {
      unsubscribe();
      sync.start();
    }
  });
}

/** Wires the real browser adapters into the app's service container. */
export async function composeBrowserServices(options: {
  config: AppConfig;
  logger: Logger;
  version: string;
}): Promise<AppServices> {
  const { config, logger, version } = options;
  const now = () => Date.now();
  const accounts = new AccountsDatabase();
  const localStore = createBrowserKeyValueStore(
    () => window.localStorage,
    logger,
  );
  const connectivity = browserConnectivity();
  const localKeys = createLocalWrappedKeyStore(accounts);

  // supabase-js is only downloaded when a backend is configured.
  const client = config.supabase
    ? (
        await import('@/modules/auth/infrastructure/supabaseClient')
      ).createSupabaseBrowserClient(config.supabase, window.localStorage)
    : null;

  const identity = client
    ? createSupabaseIdentityProvider(
        client,
        `${window.location.origin}/sign-in`,
        `${window.location.origin}/reset-password`,
      )
    : createLocalIdentityProvider({ db: accounts, createId, now });

  // Supabase accounts keep the wrapped key on the server so every device
  // can unlock the workspace (ADR 0012); local accounts keep it here.
  const keyStore = client
    ? withLocalFallback(
        createSupabaseWrappedKeyStore(client),
        localKeys,
        logger.child({ module: 'auth' }),
      )
    : localKeys;

  const auth = createAuthService({
    identity,
    keyring: createKeyring({ store: keyStore }),
    vault: createIndexedDbSessionVault(accounts),
    throttleStore: localStore,
    now,
    logger: logger.child({ module: 'auth' }),
  });

  const openWorkspace: AppServices['openWorkspace'] = ({
    session,
    dataKey,
  }) => {
    const workspaceLogger = logger.child({
      module: 'workspace',
      userId: session.userId,
    });
    const db = new WorkspaceDatabase(workspaceDatabaseName(session.userId));
    const cipher = createAesGcmCipher(dataKey);
    const holder: { store?: WorkspaceStore } = {};
    const getStore = () => {
      if (!holder.store) {
        throw new Error('workspace store used before it was created');
      }
      return holder.store;
    };
    const sync = client
      ? createSyncEngine({
          remote: createSupabaseRemoteWorkspace(client, session.userId),
          meta: createDexieSyncMetaStore(db),
          target: workspaceSyncTarget(getStore, { createId, now }),
          cipher,
          connectivity,
          now,
          logger: logger.child({ module: 'sync', userId: session.userId }),
          runExclusive: crossTabExclusive(
            syncLockName(session.userId),
            browserLocks(),
          ),
        })
      : null;
    const store = createWorkspaceStore({
      documents: createEncryptedDocumentStore(db, cipher, workspaceLogger),
      assets: createEncryptedAssetStore(db, cipher, workspaceLogger),
      logger: workspaceLogger,
      persistent: true,
      now,
      createId,
      readImageSize,
      onPersisted: sync?.enqueue,
      onRemoved: sync?.markDeleted,
      onAssetAdded: sync?.assetAdded,
      onAssetRemoved: sync?.assetRemoved,
    });
    holder.store = store;
    if (sync) {
      startWhenReady(store, sync);
    }
    const workspace: Workspace = {
      kind: 'account',
      store,
      sync,
      close: async () => {
        await store.getState().flush();
        store.getState().dispose();
        // Unsynced changes stay marked and upload at the next sign-in.
        await sync?.dispose();
        db.close();
      },
    };
    return workspace;
  };

  const openSandbox: AppServices['openSandbox'] = () => {
    const store = createWorkspaceStore({
      documents: createMemoryDocumentStore(),
      assets: createMemoryAssetStore(),
      logger: logger.child({ module: 'sandbox' }),
      persistent: false,
      now,
      createId,
      readImageSize,
    });
    return {
      kind: 'sandbox',
      store,
      sync: null,
      close: () => {
        store.getState().dispose();
        return Promise.resolve();
      },
    };
  };

  return {
    version,
    logger,
    auth,
    preferences: createPreferencesStore(localStore),
    toasts: createToastStore(),
    files: createFileDelivery(browserDeliveryEnvironment()),
    exporter: {
      toDataUrl: blobToDataUrl,
      // react-dom/server only loads when someone exports.
      renderer: {
        render: async (...args) => {
          const { svgRenderer } = await import('@/modules/render/svgMarkup');
          return svgRenderer.render(...args);
        },
      },
      rasterizer: canvasRasterizer,
      pdf: jsPdfWriter,
    },
    now,
    createId,
    openWorkspace,
    openSandbox,
    leases: createWorkspaceLeases(
      browserLeaseLocks(),
      logger.child({ module: 'workspace' }),
    ),
    shares: client ? createSupabaseShareStore(client) : null,
    cloudSync: client !== null,
    deleteAccount: ({ session, password, workspace }) =>
      deleteAccount(
        {
          auth,
          cloudFiles: client
            ? createSupabaseCloudFiles(client, session.userId)
            : null,
          closeWorkspace: () => workspace.close(),
          deleteLocalData: () =>
            Dexie.delete(workspaceDatabaseName(session.userId)),
          isOnline: connectivity.isOnline,
          logger: logger.child({ module: 'account', userId: session.userId }),
        },
        { session, password },
      ),
  };
}
