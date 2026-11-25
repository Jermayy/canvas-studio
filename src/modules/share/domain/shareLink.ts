import type { DesignDocument } from '@/modules/document/domain/schema';
import type { ExportScale } from '@/modules/export/domain/exportOptions';
import { z } from 'zod';

/** Public share pages live at /s/<share id> (ADR 0008). */
export const SHARE_PATH_PREFIX = '/s/';

/** Keeps public images viewable on any screen without huge files. */
export const MAX_SHARE_IMAGE_SIDE = 2400;
/** Matches the workspace-shares bucket limit. */
export const MAX_SHARE_IMAGE_BYTES = 15 * 1024 * 1024;

const shareIdSchema = z.uuid();

export function buildShareUrl(origin: string, shareId: string): string {
  return `${origin}${SHARE_PATH_PREFIX}${shareId}`;
}

/** The share id of a /s/… path, validated so junk never reaches the server. */
export function parseShareId(candidate: string): string | null {
  const parsed = shareIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

/** Retina-sharp when it fits the cap, otherwise actual size. */
export function shareImageScale(document: DesignDocument): ExportScale {
  const side = Math.max(document.format.width, document.format.height);
  return side * 2 <= MAX_SHARE_IMAGE_SIDE ? 2 : 1;
}
