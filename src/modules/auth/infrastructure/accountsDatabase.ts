import type { WrappedKey } from '@/modules/auth/application/ports';
import type { Session } from '@/modules/auth/domain/authModel';
import Dexie, { type Table } from 'dexie';

/**
 * Device-level auth storage, separate from any workspace: local accounts
 * (password verifiers only, never passwords), wrapped workspace keys and
 * the current session.
 */

export interface LocalAccountRow {
  id: string;
  email: string;
  displayName: string;
  salt: string;
  verifier: string;
  iterations: number;
  createdAt: string;
}

/** The data key wrapped by the password, and (since v2.1) by a recovery code. */
export interface WrappedKeyRow extends WrappedKey {
  userId: string;
  recovery?: WrappedKey;
  /** Absent on rows written before optimistic concurrency (treated as 1). */
  version?: number;
}

export interface SessionRow {
  id: 'current';
  session: Session;
  dataKey: CryptoKey;
}

export class AccountsDatabase extends Dexie {
  declare accounts: Table<LocalAccountRow, string>;
  declare keys: Table<WrappedKeyRow, string>;
  declare sessions: Table<SessionRow, string>;

  constructor(name = 'canvas-studio-v2-accounts') {
    super(name);
    this.version(1).stores({
      accounts: 'id, &email',
      keys: 'userId',
      sessions: 'id',
    });
  }
}
