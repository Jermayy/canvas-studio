import { useNotify, useServices, useWorkspace } from '@/app/services';
import { createImage } from '@/modules/document/domain/elementFactory';
import type { Point } from '@/modules/document/domain/geometry';
import { useStudioContext } from '@/modules/studio/studioContext';
import { UploadRejectedError } from '@/modules/workspace/state/workspaceStore';
import { useState } from 'react';

/** Validates, stores and places user images; reports progress and problems. */
export function useImageUpload() {
  const { store: workspace } = useWorkspace();
  const { store: studio } = useStudioContext();
  const { logger } = useServices();
  const notify = useNotify();
  const [pending, setPending] = useState(0);

  const upload = async (
    files: readonly File[],
    options: { place: boolean; at?: Point },
  ) => {
    setPending((count) => count + files.length);
    let added = 0;
    for (const file of files) {
      try {
        const meta = await workspace.getState().addImage(file);
        added += 1;
        if (options.place) {
          const canvas = studio.getState().history.present.format;
          studio
            .getState()
            .insert((id) => createImage(id, meta, canvas), options.at);
        }
      } catch (error) {
        if (error instanceof UploadRejectedError) {
          notify(error.message, { tone: 'warning' });
        } else {
          logger.error('studio.upload_failed', { error });
          notify(`${file.name} couldn’t be saved. Try again.`, {
            tone: 'error',
          });
        }
      } finally {
        setPending((count) => count - 1);
      }
    }
    if (added > 0) {
      notify(
        options.place
          ? `Added ${added} image${added === 1 ? '' : 's'} to the canvas.`
          : `Uploaded ${added} image${added === 1 ? '' : 's'}.`,
        { tone: 'success' },
      );
    }
  };

  return { upload, pending };
}
