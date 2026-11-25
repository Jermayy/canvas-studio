import type { AuthService } from '@/modules/auth/application/authService';
import { AuthError, type Session } from '@/modules/auth/domain/authModel';
import type { Logger } from '@/shared/logger';

/** Deletes every cloud file the user owns; returns how many went. */
export interface CloudFiles {
  deleteAll: () => Promise<number>;
}

export interface DeleteAccountDependencies {
  auth: Pick<AuthService, 'verifyPassword' | 'deleteIdentity'>;
  /** Null for device-local accounts (nothing in the cloud). */
  cloudFiles: CloudFiles | null;
  /** Stops sync and saving so nothing is re-uploaded mid-deletion. */
  closeWorkspace: () => Promise<void>;
  /** Deletes this device's encrypted copy of the workspace. */
  deleteLocalData: () => Promise<void>;
  isOnline: () => boolean;
  logger: Logger;
}

export type DeleteAccountResult =
  | { ok: true; localDataRemains: boolean }
  /** `workspaceClosed`: the app must sign out (the workspace is gone). */
  | { ok: false; message: string; workspaceClosed: boolean };

export const OFFLINE_MESSAGE = 'You need to be online to delete your account.';
export const INCOMPLETE_MESSAGE =
  'Your account wasn’t fully deleted. Sign in and try again; nothing else will change.';

/**
 * Deletes the signed-in account and all its data (playbook 16: user
 * rights). Order matters and every step is safe to retry:
 *
 * 1. prove the password (nothing has changed if this fails);
 * 2. stop sync, so nothing is uploaded again;
 * 3. delete cloud files (the server refuses to delete an account that
 *    still has files, so none can be orphaned);
 * 4. delete the account (cloud keys, designs and shares cascade) and the
 *    wrapped key and session on this device;
 * 5. delete this device's encrypted workspace.
 */
export async function deleteAccount(
  deps: DeleteAccountDependencies,
  input: { session: Session; password: string },
): Promise<DeleteAccountResult> {
  if (deps.cloudFiles && !deps.isOnline()) {
    return { ok: false, message: OFFLINE_MESSAGE, workspaceClosed: false };
  }
  try {
    await deps.auth.verifyPassword(input);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AuthError
          ? error.message
          : 'Couldn’t check your password. Try again.',
      workspaceClosed: false,
    };
  }

  await deps.closeWorkspace();
  try {
    if (deps.cloudFiles) {
      const files = await deps.cloudFiles.deleteAll();
      deps.logger.info('account.files_deleted', { files });
    }
    await deps.auth.deleteIdentity(input.session);
  } catch (error) {
    deps.logger.error('account.delete_failed', { error });
    return { ok: false, message: INCOMPLETE_MESSAGE, workspaceClosed: true };
  }

  try {
    await deps.deleteLocalData();
  } catch (error) {
    // The account is gone; leftover ciphertext is unreadable without it.
    deps.logger.error('account.local_delete_failed', { error });
    return { ok: true, localDataRemains: true };
  }
  return { ok: true, localDataRemains: false };
}
