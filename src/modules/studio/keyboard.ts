/** Platform modifier label for shortcut hints (⌘ on Apple devices). */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl+';

/** True when keystrokes belong to a text field rather than the canvas. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'button', 'range', 'color'].includes(target.type))
  );
}
