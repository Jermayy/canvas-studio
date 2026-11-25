import { navigate, parseRoute, safeNext } from '@/app/router';
import {
  applyPreferences,
  createPreferencesStore,
  DEFAULT_PREFERENCES,
} from '@/modules/preferences/preferences';
import { createMemoryKeyValueStore } from '@/shared/lib/keyValueStore';
import {
  ACTION_TOAST_MS,
  createToastStore,
  DEFAULT_TOAST_MS,
} from '@/shared/ui/toastStore';

describe('router', () => {
  it('parses every route', () => {
    expect(parseRoute('/', '')).toEqual({ name: 'landing' });
    expect(parseRoute('/sign-in', '?next=%2Fstudio%2Fabc')).toEqual({
      name: 'sign-in',
      next: '/studio/abc',
    });
    expect(parseRoute('/sign-up/', '')).toEqual({
      name: 'sign-up',
      next: '/projects',
    });
    expect(parseRoute('/projects', '?type=party')).toEqual({
      name: 'projects',
      search: '?type=party',
    });
    expect(parseRoute('/sandbox', '')).toEqual({ name: 'sandbox' });
    expect(
      parseRoute('/studio/0b5f3c1e-1234-4abc-9def-1234567890ab', ''),
    ).toEqual({
      name: 'studio',
      documentId: '0b5f3c1e-1234-4abc-9def-1234567890ab',
    });
    expect(parseRoute('/studio/<script>', '')).toEqual({ name: 'not-found' });
    expect(parseRoute('/anything', '')).toEqual({ name: 'not-found' });
  });

  it('only redirects to paths inside the app after sign-in', () => {
    expect(safeNext('/studio/x')).toBe('/studio/x');
    expect(safeNext('//evil.example')).toBe('/projects');
    expect(safeNext('/\\evil.example')).toBe('/projects');
    expect(safeNext('https://evil.example')).toBe('/projects');
    expect(safeNext(null)).toBe('/projects');
  });

  it('navigates with pushState or replaceState and notifies listeners', () => {
    const listener = vi.fn();
    window.addEventListener('canvas-studio:navigate', listener);
    navigate('/projects?q=a');
    expect(window.location.pathname + window.location.search).toBe(
      '/projects?q=a',
    );
    const length = window.history.length;
    navigate('/sandbox', { replace: true });
    expect(window.history.length).toBe(length);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener('canvas-studio:navigate', listener);
  });
});

describe('preferences', () => {
  it('starts from defaults, persists changes and resets', () => {
    const storage = createMemoryKeyValueStore();
    const store = createPreferencesStore(storage);
    expect(store.getState().preferences).toEqual(DEFAULT_PREFERENCES);
    store.getState().update({ theme: 'dark', accent: 'rose' });
    expect(
      createPreferencesStore(storage).getState().preferences,
    ).toMatchObject({ theme: 'dark', accent: 'rose' });
    store.getState().reset();
    expect(createPreferencesStore(storage).getState().preferences).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('ignores corrupt or partial stored values', () => {
    const storage = createMemoryKeyValueStore();
    storage.set('canvas-studio-v2:preferences', '{not json');
    expect(createPreferencesStore(storage).getState().preferences).toEqual(
      DEFAULT_PREFERENCES,
    );
    storage.set(
      'canvas-studio-v2:preferences',
      JSON.stringify({ theme: 'dark', accent: 'neon' }),
    );
    expect(createPreferencesStore(storage).getState().preferences).toEqual(
      DEFAULT_PREFERENCES,
    );
    storage.set(
      'canvas-studio-v2:preferences',
      JSON.stringify({ density: 'compact' }),
    );
    expect(createPreferencesStore(storage).getState().preferences.density).toBe(
      'compact',
    );
  });

  it('rejects invalid updates', () => {
    const store = createPreferencesStore(createMemoryKeyValueStore());
    expect(() => {
      store.getState().update({ accent: 'neon' });
    }).toThrow();
  });

  it('applies to the document root', () => {
    const root = document.createElement('div');
    applyPreferences(root, {
      ...DEFAULT_PREFERENCES,
      theme: 'light',
      uiScale: '110',
      reduceMotion: true,
    });
    expect(root.dataset).toMatchObject({
      theme: 'light',
      accent: 'indigo',
      density: 'comfortable',
      reduceMotion: 'true',
    });
    expect(root.style.fontSize).toBe('17.6px');
  });
});

describe('toasts', () => {
  it('gives actionable toasts longer and keeps the newest four', () => {
    const store = createToastStore();
    const id = store.getState().notify('Saved');
    store
      .getState()
      .notify('Deleted', { action: { label: 'Undo', run: vi.fn() } });
    expect(store.getState().toasts.map((toast) => toast.durationMs)).toEqual([
      DEFAULT_TOAST_MS,
      ACTION_TOAST_MS,
    ]);
    for (let index = 0; index < 5; index += 1) {
      store.getState().notify(`n${index}`, { tone: 'error' });
    }
    expect(store.getState().toasts).toHaveLength(4);
    store.getState().dismiss(id);
    store.getState().dismiss(store.getState().toasts[0]?.id ?? 0);
    expect(store.getState().toasts).toHaveLength(3);
  });
});
