import { IconButton } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import type { Toast, ToastStore } from '@/shared/ui/toastStore';
import type { UiIconName } from '@/shared/ui/uiIcons';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

const TONE_ICONS: Record<Toast['tone'], UiIconName> = {
  info: 'info',
  success: 'circle-check',
  warning: 'warning',
  error: 'alert',
};

function ToastItem({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const onDismiss = () => {
    dismiss(toast.id);
  };

  // Restarts the full duration after a pause, so there's always time to act.
  useEffect(() => {
    if (paused) {
      return;
    }
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, toast.durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [paused, toast.id, toast.durationMs, dismiss]);

  return (
    <li
      className={`toast toast--${toast.tone}`}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
    >
      <Icon name={TONE_ICONS[toast.tone]} className="toast__icon" />
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action?.run();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <IconButton
        icon="close"
        label="Dismiss notification"
        size="sm"
        onClick={onDismiss}
      />
    </li>
  );
}

export function Toaster({ store }: { store: ToastStore }) {
  const toasts = useStore(store, (state) => state.toasts);
  const dismiss = useStore(store, (state) => state.dismiss);
  return (
    <ol className="toaster" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
      ))}
    </ol>
  );
}
