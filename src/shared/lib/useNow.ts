import { useSyncExternalStore } from 'react';

/**
 * A shared, ticking "now" for relative times ("5 min ago"). Render must
 * stay pure, so components read time from here instead of Date.now().
 */

const TICK_MS = 30_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) {
        notify();
      }
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
    }
  };
}

const snapshot = () => now;

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot);
}
