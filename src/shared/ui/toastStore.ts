import { createStore, type StoreApi } from 'zustand/vanilla';

/** App-wide notifications. Components post through `notify`; the Toaster renders. */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
  durationMs: number;
}

export interface ToastState {
  toasts: readonly Toast[];
  notify: (
    message: string,
    options?: {
      tone?: ToastTone;
      action?: Toast['action'];
      durationMs?: number;
    },
  ) => number;
  dismiss: (id: number) => void;
}

export type ToastStore = StoreApi<ToastState>;

export const DEFAULT_TOAST_MS = 6000;
/** Toasts with an action stay long enough to use it (WCAG 2.2.1). */
export const ACTION_TOAST_MS = 10_000;
const MAX_VISIBLE = 4;

export function createToastStore(): ToastStore {
  let nextId = 1;
  return createStore<ToastState>()((set) => ({
    toasts: [],
    notify: (message, options = {}) => {
      const id = nextId;
      nextId += 1;
      const toast: Toast = {
        id,
        message,
        tone: options.tone ?? 'info',
        action: options.action,
        durationMs:
          options.durationMs ??
          (options.action ? ACTION_TOAST_MS : DEFAULT_TOAST_MS),
      };
      set((state) => ({
        toasts: [...state.toasts, toast].slice(-MAX_VISIBLE),
      }));
      return id;
    },
    dismiss: (id) => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    },
  }));
}
