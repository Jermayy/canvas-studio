/**
 * Asks the browser not to evict this origin's IndexedDB under storage
 * pressure or inactivity (e.g. Safari's 7-day rule for sites you haven't
 * visited). Browsers decide: Chrome grants by engagement, Firefox asks
 * the user, so call it from a user action, not on page load.
 */
export type PersistenceResult = 'persisted' | 'best-effort' | 'unsupported';

export async function requestPersistentStorage(
  storage:
    Partial<Pick<StorageManager, 'persist' | 'persisted'>> | undefined = (
    globalThis.navigator as Partial<Navigator> | undefined
  )?.storage,
): Promise<PersistenceResult> {
  if (!storage?.persist || !storage.persisted) {
    return 'unsupported';
  }
  try {
    if (await storage.persisted()) {
      return 'persisted';
    }
    return (await storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
