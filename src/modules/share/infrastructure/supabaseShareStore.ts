import type { DesignShare, ShareStore } from '@/modules/share/shareStore';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const SHARES_TABLE = 'workspace_shares';
export const SHARES_BUCKET = 'workspace-shares';
const COLUMNS = 'id, title, width, height, updated_at';
/** Short, so a refreshed image shows up quickly through the CDN. */
const IMAGE_CACHE_SECONDS = '60';
/**
 * The bucket is private: the public page gets a short-lived signed URL,
 * which storage only issues while the share is live (migration
 * 20261126000000), so deleting the design cuts access within minutes.
 */
const SIGNED_URL_SECONDS = 300;

const shareRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  updated_at: z.string(),
});

function toShare(row: unknown): DesignShare {
  const parsed = shareRowSchema.parse(row);
  return {
    id: parsed.id,
    title: parsed.title,
    width: parsed.width,
    height: parsed.height,
    updatedAt: parsed.updated_at,
  };
}

export function shareImagePath(shareId: string): string {
  return `${shareId}.png`;
}

export class ShareStoreError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`${context}: ${cause.message}`);
    this.name = 'ShareStoreError';
  }
}

/**
 * Supabase implementation. RLS limits management to the owner's shares;
 * the public page reads through `get_workspace_share()` (exact token only).
 */
export function createSupabaseShareStore(client: SupabaseClient): ShareStore {
  const imageUrl = async (share: Pick<DesignShare, 'id'>) => {
    const { data, error } = await client.storage
      .from(SHARES_BUCKET)
      .createSignedUrl(shareImagePath(share.id), SIGNED_URL_SECONDS);
    if (error) {
      throw new ShareStoreError('sign share image failed', error);
    }
    return data.signedUrl;
  };

  const getForDesign = async (designId: string) => {
    const { data, error } = await client
      .from(SHARES_TABLE)
      .select(COLUMNS)
      .eq('design_id', designId)
      .maybeSingle();
    if (error) {
      throw new ShareStoreError('load share failed', error);
    }
    return data === null ? null : toShare(data);
  };

  return {
    getForDesign,

    publish: async (input) => {
      const existing = await getForDesign(input.designId);
      const { data, error } = await client
        .from(SHARES_TABLE)
        .upsert(
          {
            design_id: input.designId,
            title: input.title,
            width: input.width,
            height: input.height,
          },
          { onConflict: 'design_id' },
        )
        .select(COLUMNS)
        .single();
      if (error) {
        throw new ShareStoreError('create share failed', error);
      }
      const share = toShare(data);
      // The row must exist first: storage policies check share ownership.
      const { error: uploadError } = await client.storage
        .from(SHARES_BUCKET)
        .upload(shareImagePath(share.id), input.png, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: IMAGE_CACHE_SECONDS,
        });
      if (uploadError) {
        if (!existing) {
          // Don't leave a brand-new link pointing at no image.
          await client.from(SHARES_TABLE).delete().eq('id', share.id);
        }
        throw new ShareStoreError('upload share image failed', uploadError);
      }
      return share;
    },

    unpublish: async (designId) => {
      const share = await getForDesign(designId);
      if (!share) {
        return;
      }
      // Image first: if this fails the link still exists and can be retried.
      const { error: removeError } = await client.storage
        .from(SHARES_BUCKET)
        .remove([shareImagePath(share.id)]);
      if (removeError) {
        throw new ShareStoreError('delete share image failed', removeError);
      }
      const { error } = await client
        .from(SHARES_TABLE)
        .delete()
        .eq('id', share.id);
      if (error) {
        throw new ShareStoreError('delete share failed', error);
      }
    },

    fetchShared: async (shareId) => {
      const response: { data: unknown; error: { message: string } | null } =
        await client.rpc('get_workspace_share', { share_id: shareId });
      if (response.error) {
        throw new ShareStoreError('load shared design failed', response.error);
      }
      const [row] = z.array(z.unknown()).max(1).parse(response.data);
      if (row === undefined) {
        return null;
      }
      const share = toShare(row);
      return { ...share, imageUrl: await imageUrl(share) };
    },
  };
}
