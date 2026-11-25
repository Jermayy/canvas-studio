/**
 * Port for view-only share links (ADR 0008, 0012). A share publishes a
 * design's title and a PNG; the design itself stays encrypted. The
 * Supabase adapter implements it; tests use a fake.
 */

export interface DesignShare {
  /** The unguessable link token. */
  id: string;
  title: string;
  width: number;
  height: number;
  /** ISO time of the last publish; busts image caches. */
  updatedAt: string;
}

export interface PublishShareInput {
  designId: string;
  title: string;
  width: number;
  height: number;
  png: Blob;
}

/** What the public page shows. */
export interface SharedDesignView extends DesignShare {
  imageUrl: string;
}

export interface ShareStore {
  /** The design's current share, or null if it isn't shared. */
  getForDesign: (designId: string) => Promise<DesignShare | null>;
  /** Creates the share, or refreshes its image and title; keeps the link. */
  publish: (input: PublishShareInput) => Promise<DesignShare>;
  /** Deletes the image, then the link. No-op if not shared. */
  unpublish: (designId: string) => Promise<void>;
  /** Public read by token; null when it doesn't exist (any more). */
  fetchShared: (shareId: string) => Promise<SharedDesignView | null>;
}
