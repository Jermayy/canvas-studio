import type { KeyValueStore } from '@/shared/lib/keyValueStore';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Interface customisation. Per-browser convenience settings, so they live
 * in localStorage (not the encrypted workspace) and apply before sign-in.
 */

export const ACCENTS = [
  { id: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { id: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { id: 'teal', label: 'Teal', swatch: '#0d9488' },
  { id: 'rose', label: 'Rose', swatch: '#e11d48' },
  { id: 'amber', label: 'Amber', swatch: '#d97706' },
  { id: 'graphite', label: 'Graphite', swatch: '#475569' },
] as const;

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  accent: z.enum(ACCENTS.map((accent) => accent.id) as [string, ...string[]]),
  density: z.enum(['comfortable', 'compact']),
  uiScale: z.enum(['90', '100', '110']),
  canvasBackdrop: z.enum(['dots', 'grid', 'plain']),
  snapping: z.boolean(),
  layerHints: z.boolean(),
  reduceMotion: z.boolean(),
  projectView: z.enum(['grid', 'list']),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  accent: 'indigo',
  density: 'comfortable',
  uiScale: '100',
  canvasBackdrop: 'dots',
  snapping: true,
  layerHints: true,
  reduceMotion: false,
  projectView: 'grid',
};

const STORAGE_KEY = 'canvas-studio-v2:preferences';

export interface PreferencesState {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

export type PreferencesStore = StoreApi<PreferencesState>;

function readStored(storage: KeyValueStore): Preferences {
  const raw = storage.get(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_PREFERENCES;
  }
  try {
    // Unknown or missing keys fall back to defaults instead of resetting everything.
    const parsed = preferencesSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success
      ? { ...DEFAULT_PREFERENCES, ...parsed.data }
      : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function createPreferencesStore(
  storage: KeyValueStore,
): PreferencesStore {
  return createStore<PreferencesState>()((set, get) => ({
    preferences: readStored(storage),
    update: (patch) => {
      const preferences = preferencesSchema.parse({
        ...get().preferences,
        ...patch,
      });
      storage.set(STORAGE_KEY, JSON.stringify(preferences));
      set({ preferences });
    },
    reset: () => {
      storage.remove(STORAGE_KEY);
      set({ preferences: DEFAULT_PREFERENCES });
    },
  }));
}

/** Applies preferences as data attributes; CSS does the rest. */
export function applyPreferences(
  root: HTMLElement,
  preferences: Preferences,
): void {
  root.dataset.theme = preferences.theme;
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.reduceMotion = String(preferences.reduceMotion);
  root.style.fontSize = `${(Number(preferences.uiScale) / 100) * 16}px`;
}
