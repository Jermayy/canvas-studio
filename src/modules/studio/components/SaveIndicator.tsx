import { useWorkspace, useWorkspaceState } from '@/app/services';
import { formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { Icon } from '@/shared/ui/Icon';

/** Live save state for the open design: what's saved, where, and when. */
export function SaveIndicator({ documentId }: { documentId: string }) {
  const { store } = useWorkspace();
  const persistent = useWorkspaceState((state) => state.persistent);
  const save = useWorkspaceState((state) => state.saves[documentId]);
  const now = useNow();

  if (!persistent) {
    return (
      <span
        className="status-chip status-chip--sandbox"
        data-tooltip="Sandbox mode: changes live in this tab only. Export to keep your design."
        tabIndex={0}
      >
        <Icon name="warning" size={15} />
        <span className="status-chip__label">Not saved</span>
      </span>
    );
  }

  switch (save?.status) {
    case 'pending':
      return (
        <span className="status-chip status-chip--pending" role="status">
          <span className="status-dot" aria-hidden="true" />
          <span className="status-chip__label">Unsaved changes</span>
        </span>
      );
    case 'saving':
      return (
        <span className="status-chip status-chip--saving" role="status">
          <Icon name="spinner" size={15} className="spin" />
          <span className="status-chip__label">Saving…</span>
        </span>
      );
    case 'error':
      return (
        <button
          type="button"
          className="status-chip status-chip--error"
          data-tooltip={save.error ?? 'Save failed'}
          onClick={() => {
            void store.getState().retrySave(documentId);
          }}
        >
          <Icon name="alert" size={15} />
          <span className="status-chip__label">Save failed · Retry</span>
        </button>
      );
    case 'saved':
    case undefined:
      return (
        <span
          className="status-chip status-chip--saved"
          role="status"
          tabIndex={0}
          data-tooltip={
            save?.savedAt
              ? `Saved to this device (encrypted) ${formatRelative(new Date(save.savedAt).toISOString(), now)}`
              : 'All changes saved to this device (encrypted)'
          }
        >
          <Icon name="circle-check" size={15} />
          <span className="status-chip__label">Saved</span>
        </span>
      );
  }
}
