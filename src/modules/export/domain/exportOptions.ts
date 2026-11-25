import type { DesignDocument } from '@/modules/document/domain/schema';
import { validateFileName, withExtension } from '@/shared/lib/fileName';

/** Export formats and the rules for choosing size and quality. */

export const EXPORT_FORMATS = [
  {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    description: 'Print-ready, high resolution',
    transparency: false,
    vector: false,
  },
  {
    id: 'png',
    label: 'PNG',
    extension: 'png',
    mimeType: 'image/png',
    description: 'Lossless, supports transparency',
    transparency: true,
    vector: false,
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    description: 'Small files for email and web',
    transparency: false,
    vector: false,
  },
  {
    id: 'svg',
    label: 'SVG',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    description: 'Vector, scales to any size',
    transparency: true,
    vector: true,
  },
] as const;

export type ExportFormatId = (typeof EXPORT_FORMATS)[number]['id'];
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportScale = 1 | 2 | 3 | 4;

export const EXPORT_SCALES: readonly ExportScale[] = [1, 2, 3, 4];

/**
 * Safari caps canvases at 16.7 megapixels (4096²); staying under it keeps
 * raster exports working in every browser.
 */
export const MAX_RASTER_PIXELS = 16_777_216;

export interface ExportOptions {
  format: ExportFormatId;
  fileName: string;
  scale: ExportScale;
  /** JPEG only, 0.5–1. */
  quality: number;
  /** PNG and SVG only. */
  transparent: boolean;
}

export function exportFormat(id: ExportFormatId): ExportFormat {
  return EXPORT_FORMATS.find((format) => format.id === id) ?? EXPORT_FORMATS[0];
}

export function maxScale(document: DesignDocument): ExportScale {
  const pixels = document.format.width * document.format.height;
  const largest = [...EXPORT_SCALES]
    .reverse()
    .find((scale) => pixels * scale * scale <= MAX_RASTER_PIXELS);
  return largest ?? 1;
}

export function outputSize(
  document: DesignDocument,
  options: Pick<ExportOptions, 'format' | 'scale'>,
): { width: number; height: number } {
  const scale = exportFormat(options.format).vector ? 1 : options.scale;
  return {
    width: Math.round(document.format.width * scale),
    height: Math.round(document.format.height * scale),
  };
}

/** Effective print resolution at the design's physical size (96 px/in). */
export function effectiveDpi(scale: ExportScale): number {
  return 96 * scale;
}

export type OptionsCheck =
  | { ok: true; fileName: string }
  | { ok: false; errors: Partial<Record<'fileName' | 'scale', string>> };

export function checkExportOptions(
  document: DesignDocument,
  options: ExportOptions,
): OptionsCheck {
  const errors: Partial<Record<'fileName' | 'scale', string>> = {};
  const name = validateFileName(options.fileName);
  if (!name.ok) {
    errors.fileName = name.message;
  }
  const format = exportFormat(options.format);
  if (!format.vector && options.scale > maxScale(document)) {
    errors.scale = `This design is too large to export at ${options.scale}×. Use ${maxScale(document)}× or less.`;
  }
  if (!name.ok || errors.scale) {
    return { ok: false, errors };
  }
  return { ok: true, fileName: withExtension(name.value, format.extension) };
}

export function defaultExportOptions(
  document: DesignDocument,
  fileName: string,
): ExportOptions {
  return {
    format: 'png',
    fileName,
    scale: Math.min(2, maxScale(document)) as ExportScale,
    quality: 0.92,
    transparent: false,
  };
}
