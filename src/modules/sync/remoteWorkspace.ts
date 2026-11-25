/**
 * Port for the cloud copy of an encrypted workspace. Everything crossing
 * it is ciphertext: the server stores sealed designs and images it can't
 * read, plus the plaintext metadata sync needs (ids, versions, times,
 * tombstones). The Supabase adapter implements it; tests use a fake.
 */

/** AES-GCM output in wire form: base64 IV and ciphertext. */
export interface WireSealed {
  iv: string;
  ciphertext: string;
}

export interface RemoteDesign {
  id: string;
  version: number;
  /** Null for a tombstone. */
  payload: WireSealed | null;
  /** ISO time of the edit on the device that made it. */
  clientUpdatedAt: string;
  /** ISO server time; drives the pull cursor. */
  updatedAt: string;
  deletedAt: string | null;
}

export interface RemoteDesignWrite {
  id: string;
  payload: WireSealed | null;
  clientUpdatedAt: string;
  deletedAt: string | null;
}

export interface PullCursor {
  updatedAt: string;
  /** Empty means "from updatedAt inclusive" (a rewound cursor). */
  id: string;
}

export type RealtimeStatus = 'connected' | 'disconnected';

export interface RemoteWorkspace {
  /** Rows changed after the cursor, ordered by (updatedAt, id). */
  fetchChangedSince: (
    cursor: PullCursor | null,
    limit: number,
  ) => Promise<RemoteDesign[]>;
  fetchById: (id: string) => Promise<RemoteDesign | null>;
  /** Creates version 1; null if the id already exists. */
  insert: (design: RemoteDesignWrite) => Promise<RemoteDesign | null>;
  /** Writes `expectedVersion + 1`; null on a version conflict. */
  update: (
    design: RemoteDesignWrite,
    expectedVersion: number,
  ) => Promise<RemoteDesign | null>;
  /** Idempotent: uploading an existing asset succeeds. */
  uploadAsset: (id: string, sealedEnvelope: string) => Promise<void>;
  /** Null when the asset isn't in the cloud. */
  downloadAsset: (id: string) => Promise<string | null>;
  /** Idempotent: deleting a missing asset succeeds. */
  deleteAsset: (id: string) => Promise<void>;
  /** Calls `onChange` when any of the user's designs change remotely. */
  subscribe: (
    onChange: () => void,
    onStatus: (status: RealtimeStatus) => void,
  ) => () => void;
}
