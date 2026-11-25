import { useServices, useWorkspace } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  exportDesign,
  ExportError,
  type ExportPhase,
} from '@/modules/export/application/exportDesign';
import type { ExportOptions } from '@/modules/export/domain/exportOptions';
import { useState } from 'react';

export const PHASE_LABELS: Record<ExportPhase, string> = {
  collecting: 'Gathering images…',
  rendering: 'Rendering design…',
  encoding: 'Encoding file…',
  done: 'Done',
};

/** Runs the export pipeline with this app's adapters and tracks its phase. */
export function useExporter() {
  const { exporter, logger } = useServices();
  const { store } = useWorkspace();
  const [phase, setPhase] = useState<ExportPhase | null>(null);

  const run = async (document: DesignDocument, options: ExportOptions) => {
    const started = performance.now();
    try {
      const result = await exportDesign(document, options, {
        ...exporter,
        loadAsset: (id) => store.getState().getAssetBlob(id),
        onPhase: setPhase,
      });
      logger.info('export.completed', {
        format: options.format,
        scale: options.scale,
        bytes: result.blob.size,
        durationMs: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      logger.error('export.failed', { format: options.format, error });
      throw error instanceof ExportError
        ? error
        : new ExportError(
            'The export failed. Try a smaller size or another format.',
          );
    } finally {
      setPhase(null);
    }
  };

  return { run, phase, busy: phase !== null };
}
