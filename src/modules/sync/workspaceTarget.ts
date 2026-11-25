import { CONFLICT_SUFFIX, type SyncTarget } from '@/modules/sync/syncEngine';
import type { WorkspaceStore } from '@/modules/workspace/state/workspaceStore';

const MAX_NAME = 120;

/** Adapts a workspace store to what the sync engine needs. */
export function workspaceSyncTarget(
  getStore: () => WorkspaceStore,
  deps: { createId: () => string; now: () => number },
): SyncTarget {
  const state = () => getStore().getState();
  return {
    getDocument: (id) => state().documents[id],
    listDocumentIds: () => Object.keys(state().documents),
    hasUnsavedChanges: (id) => state().hasUnsavedChanges(id),
    applyRemoteDocument: (document, guard) =>
      state().applyRemoteDocument(document, guard),
    removeRemoteDocument: (id, guard) =>
      state().removeRemoteDocument(id, guard),
    createConflictCopy: (document) => {
      const at = new Date(deps.now()).toISOString();
      const base = document.name.slice(0, MAX_NAME - CONFLICT_SUFFIX.length);
      return state().createDocument({
        ...document,
        id: deps.createId(),
        name: `${base}${CONFLICT_SUFFIX}`,
        createdAt: at,
        updatedAt: at,
      });
    },
    hasAsset: (id) => state().assets.some((asset) => asset.id === id),
    listAssetIds: () => state().assets.map((asset) => asset.id),
    getAsset: async (id) => {
      const meta = state().assets.find((asset) => asset.id === id);
      if (!meta) {
        return null;
      }
      const blob = await state().getAssetBlob(id);
      return blob ? { meta, blob } : null;
    },
    applyRemoteAsset: (meta, blob) => state().applyRemoteAsset(meta, blob),
  };
}
