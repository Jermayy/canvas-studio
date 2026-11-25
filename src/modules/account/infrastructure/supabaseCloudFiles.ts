import type { CloudFiles } from '@/modules/account/deleteAccount';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/** Buckets that keep user files under "<user id>/" (v2 and legacy v1). */
export const USER_FOLDER_BUCKETS = ['workspace-assets', 'design-assets'];
/** Share tables and the public buckets holding "<share id>.png". */
export const SHARE_SOURCES = [
  { table: 'workspace_shares', bucket: 'workspace-shares' },
  { table: 'design_shares', bucket: 'design-shares' },
];
const LIST_PAGE_SIZE = 100;
/** Stops a misbehaving list/remove pair from looping forever. */
const MAX_DELETE_ROUNDS = 1_000;

const listSchema = z.array(z.object({ name: z.string().min(1) }));
const idsSchema = z.array(z.object({ id: z.string() }));

export class CloudFilesError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`${context}: ${cause.message}`);
    this.name = 'CloudFilesError';
  }
}

/**
 * Deletes every file the user owns in Supabase Storage, step one of
 * account deletion (`delete_my_account()` refuses while any remain).
 * Storage objects can't be deleted with SQL on Supabase, hence the API.
 */
export function createSupabaseCloudFiles(
  client: SupabaseClient,
  userId: string,
): CloudFiles {
  const emptyFolder = async (bucketName: string): Promise<number> => {
    const bucket = client.storage.from(bucketName);
    let deleted = 0;
    for (let round = 0; round < MAX_DELETE_ROUNDS; round += 1) {
      // Always list from the start: removed files drop out of the listing.
      const { data, error } = await bucket.list(userId, {
        limit: LIST_PAGE_SIZE,
      });
      if (error) {
        throw new CloudFilesError(`list ${bucketName} failed`, error);
      }
      const paths = listSchema
        .parse(data)
        .map((file) => `${userId}/${file.name}`);
      if (paths.length === 0) {
        return deleted;
      }
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) {
        throw new CloudFilesError(`delete ${bucketName} failed`, removeError);
      }
      deleted += paths.length;
    }
    throw new Error(`delete files failed: ${bucketName} never emptied`);
  };

  const deleteShareImages = async (table: string, bucket: string) => {
    const { data, error } = await client.from(table).select('id');
    if (error) {
      throw new CloudFilesError(`list ${table} failed`, error);
    }
    const paths = idsSchema.parse(data).map((share) => `${share.id}.png`);
    if (paths.length === 0) {
      return 0;
    }
    const { error: removeError } = await client.storage
      .from(bucket)
      .remove(paths);
    if (removeError) {
      throw new CloudFilesError(`delete ${bucket} failed`, removeError);
    }
    return paths.length;
  };

  return {
    deleteAll: async () => {
      let deleted = 0;
      for (const bucket of USER_FOLDER_BUCKETS) {
        deleted += await emptyFolder(bucket);
      }
      for (const { table, bucket } of SHARE_SOURCES) {
        deleted += await deleteShareImages(table, bucket);
      }
      return deleted;
    },
  };
}
