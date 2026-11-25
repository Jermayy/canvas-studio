/** Bounded undo/redo stacks of immutable snapshots. */

export const HISTORY_LIMIT = 100;

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function pushHistory<T>(
  history: History<T>,
  next: T,
  limit = HISTORY_LIMIT,
): History<T> {
  if (next === history.present) {
    return history;
  }
  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: [],
  };
}

/** Replaces the present without an undo step (e.g. mid-drag previews). */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}
