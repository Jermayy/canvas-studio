import type {
  StudioActions,
  StudioState,
  StudioStore,
} from '@/modules/studio/state/studioStore';
import { createContext, use } from 'react';
import { useStore } from 'zustand';

export type StudioDialog =
  'export' | 'share' | 'commands' | 'shortcuts' | 'settings';
export type InsertTab = 'text' | 'shapes' | 'icons' | 'uploads' | 'background';

export interface StudioContextValue {
  store: StudioStore;
  mode: 'account' | 'sandbox';
  openDialog: (dialog: StudioDialog) => void;
  openInsertTab: (tab: InsertTab) => void;
}

export const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudioContext(): StudioContextValue {
  const value = use(StudioContext);
  if (!value) {
    throw new Error('StudioContext is missing: render inside <Studio>');
  }
  return value;
}

export function useStudio<T>(
  selector: (state: StudioState & StudioActions) => T,
): T {
  return useStore(useStudioContext().store, selector);
}

/** Stable action references (zustand actions never change identity). */
export function useStudioActions(): StudioActions {
  return useStudioContext().store.getState();
}
