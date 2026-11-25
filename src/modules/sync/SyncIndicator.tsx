import type { SyncEngine, SyncState } from '@/modules/sync/syncEngine';
import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';
import { formatRelative } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/useNow';
import { useStore } from 'zustand';

function describe(
  state: SyncState,
  now: number,
): { icon: UiIconName; label: string; detail: string } {
  switch (state.status) {
    case 'syncing':
      return {
        icon: 'refresh',
        label: 'Syncing',
        detail:
          state.pending > 0
            ? `Uploading ${state.pending} encrypted change${state.pending === 1 ? '' : 's'}`
            : 'Checking for changes from your other devices',
      };
    case 'offline':
      return {
        icon: 'wifi-off',
        label: 'Offline',
        detail: `Saved on this device. ${state.pending > 0 ? `${state.pending} change${state.pending === 1 ? '' : 's'} will sync when you’re back online.` : 'Changes sync when you reconnect.'}`,
      };
    case 'error':
      return {
        icon: 'cloud-off',
        label: 'Sync paused',
        detail: `${state.lastError ?? 'Sync failed'}. Retrying automatically; your work is saved on this device. Click to retry now.`,
      };
    case 'synced':
      return {
        icon: 'cloud',
        label: 'Synced',
        detail: `${
          state.lastSyncedAt
            ? `All changes synced ${formatRelative(new Date(state.lastSyncedAt).toISOString(), now)}, encrypted`
            : 'Up to date'
        }. ${state.live ? 'Edits from your other devices appear live.' : 'Checking your other devices every 30 seconds.'}`,
      };
  }
}

/** Cloud status chip; click to retry when sync is paused. */
export function SyncIndicator({ engine }: { engine: SyncEngine }) {
  const state = useStore(engine.store);
  const now = useNow();
  const { icon, label, detail } = describe(state, now);
  return (
    <button
      type="button"
      className={`status-chip status-chip--sync status-chip--${state.status}`}
      data-tooltip={detail}
      aria-label={`${label}. ${detail}`}
      onClick={() => {
        if (state.status === 'error') {
          engine.retryNow();
        }
      }}
    >
      <Icon
        name={icon}
        size={15}
        className={state.status === 'syncing' ? 'spin' : undefined}
      />
      <span className="status-chip__label">{label}</span>
    </button>
  );
}
