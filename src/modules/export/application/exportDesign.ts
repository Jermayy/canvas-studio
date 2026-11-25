import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  checkExportOptions,
  exportFormat,
  outputSize,
  type ExportOptions,
} from '@/modules/export/domain/exportOptions';

/**
 * The export pipeline: gather image assets, render the design to SVG, then
 * encode to the requested format. Browser-specific steps are ports so the
 * pipeline is testable and each step can report progress.
 */

export type ExportPhase = 'collecting' | 'rendering' | 'encoding' | 'done';

export interface SvgRenderer {
  render: (
    document: DesignDocument,
    assetUrls: Readonly<Record<string, string>>,
    options: { width: number; height: number; transparent: boolean },
  ) => Promise<string>;
}

export interface Rasterizer {
  rasterize: (input: {
    svg: string;
    width: number;
    height: number;
    mimeType: 'image/png' | 'image/jpeg';
    quality: number;
    background: string | null;
  }) => Promise<Blob>;
}

export interface PdfWriter {
  write: (input: {
    image: Blob;
    width: number;
    height: number;
    title: string;
  }) => Promise<Blob>;
}

export interface ExportDependencies {
  loadAsset: (id: string) => Promise<Blob | null>;
  toDataUrl: (blob: Blob) => Promise<string>;
  renderer: SvgRenderer;
  rasterizer: Rasterizer;
  pdf: PdfWriter;
  onPhase?: (phase: ExportPhase) => void;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

async function collectAssets(
  document: DesignDocument,
  deps: ExportDependencies,
): Promise<{ urls: Record<string, string>; missing: number }> {
  const ids = [
    ...new Set(
      document.elements.flatMap((element) =>
        element.type === 'image' && !element.hidden ? [element.assetId] : [],
      ),
    ),
  ];
  const urls: Record<string, string> = {};
  let missing = 0;
  await Promise.all(
    ids.map(async (id) => {
      const blob = await deps.loadAsset(id);
      if (blob) {
        // Inlined so the exported file is self-contained.
        urls[id] = await deps.toDataUrl(blob);
      } else {
        missing += 1;
      }
    }),
  );
  return { urls, missing };
}

export async function exportDesign(
  document: DesignDocument,
  options: ExportOptions,
  deps: ExportDependencies,
): Promise<ExportResult & { missingAssets: number }> {
  const check = checkExportOptions(document, options);
  if (!check.ok) {
    throw new ExportError(
      Object.values(check.errors)[0] ?? 'Check the export settings.',
    );
  }
  const format = exportFormat(options.format);
  const transparent = format.transparency && options.transparent;

  deps.onPhase?.('collecting');
  const { urls, missing } = await collectAssets(document, deps);

  deps.onPhase?.('rendering');
  const size = outputSize(document, options);
  const svg = await deps.renderer.render(document, urls, {
    ...size,
    transparent,
  });

  deps.onPhase?.('encoding');
  let blob: Blob;
  switch (format.id) {
    case 'svg':
      blob = new Blob([svg], { type: format.mimeType });
      break;
    case 'png':
    case 'jpeg':
      blob = await deps.rasterizer.rasterize({
        svg,
        ...size,
        mimeType: format.mimeType,
        quality: options.quality,
        // JPEG has no alpha; a transparent design gets a white page.
        background: format.id === 'jpeg' ? '#ffffff' : null,
      });
      break;
    case 'pdf': {
      const image = await deps.rasterizer.rasterize({
        svg,
        ...size,
        mimeType: 'image/png',
        quality: 1,
        background: '#ffffff',
      });
      blob = await deps.pdf.write({
        image,
        width: document.format.width,
        height: document.format.height,
        title: document.name,
      });
      break;
    }
  }
  deps.onPhase?.('done');
  return {
    blob,
    fileName: check.fileName,
    mimeType: format.mimeType,
    missingAssets: missing,
  };
}
