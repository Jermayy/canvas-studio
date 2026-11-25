import { useSyncExternalStore } from 'react';

/**
 * A tiny History-API router: a handful of screens don't justify a routing library.
 * Paths and query strings are the source of truth for navigation state.
 */

export type Route =
  | { name: 'landing' }
  | { name: 'sign-in'; next: string }
  | { name: 'sign-up'; next: string }
  | { name: 'reset-password'; email: string; code: string | null }
  | { name: 'projects'; search: string }
  | { name: 'studio'; documentId: string }
  | { name: 'sandbox' }
  | { name: 'shared'; token: string }
  | { name: 'not-found' };

export const DEFAULT_AFTER_SIGN_IN = '/projects';

const NAVIGATE_EVENT = 'canvas-studio:navigate';
const DOCUMENT_ID = /^[0-9a-f-]{8,64}$/i;

/** Only same-app paths: blocks open redirects like `//evil.com` or `/\evil.com`. */
export function safeNext(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return value;
}

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search);
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    return { name: 'landing' };
  }
  if (path === '/sign-in') {
    return { name: 'sign-in', next: safeNext(params.get('next')) };
  }
  if (path === '/reset-password') {
    return {
      name: 'reset-password',
      email: (params.get('email') ?? '').slice(0, 254),
      code: params.get('code')?.slice(0, 512) ?? null,
    };
  }
  if (path === '/sign-up') {
    return { name: 'sign-up', next: safeNext(params.get('next')) };
  }
  if (path === '/projects') {
    return { name: 'projects', search };
  }
  if (path === '/sandbox') {
    return { name: 'sandbox' };
  }
  const shared = /^\/s\/([^/]{1,64})$/.exec(path);
  if (shared?.[1]) {
    // Validated as a UUID by the page before anything is fetched.
    return { name: 'shared', token: shared[1] };
  }
  const studio = /^\/studio\/([^/]+)$/.exec(path);
  if (studio?.[1] && DOCUMENT_ID.test(studio[1])) {
    return { name: 'studio', documentId: studio[1] };
  }
  return { name: 'not-found' };
}

export function navigate(
  to: string,
  options: { replace?: boolean } = {},
): void {
  if (options.replace) {
    window.history.replaceState(null, '', to);
  } else {
    window.history.pushState(null, '', to);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

const currentLocation = () => window.location.pathname + window.location.search;

export function useLocation(): { pathname: string; search: string } {
  const href = useSyncExternalStore(subscribe, currentLocation);
  const url = new URL(href, 'http://local');
  return { pathname: url.pathname, search: url.search };
}
