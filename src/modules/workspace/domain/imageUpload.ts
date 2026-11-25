/**
 * Upload rules for user images. The declared MIME type is only a hint:
 * the file's first bytes must match an allowed raster format. SVG is
 * deliberately excluded — it can carry script.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12_000;

export type ImageMimeType =
  'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const startsWith = (
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
) => signature.every((value, index) => bytes[offset + index] === value);

/** Detects the real image type from magic bytes (needs the first 12). */
export function sniffImageType(header: Uint8Array): ImageMimeType | null {
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(header, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(header, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }
  if (
    startsWith(header, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(header, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}

export type UploadCheck =
  { ok: true; mimeType: ImageMimeType } | { ok: false; message: string };

export function checkImageUpload(
  file: { name: string; size: number },
  header: Uint8Array,
): UploadCheck {
  if (file.size === 0) {
    return { ok: false, message: `${file.name} is empty.` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `${file.name} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    };
  }
  const mimeType = sniffImageType(header);
  if (!mimeType) {
    return {
      ok: false,
      message: `${file.name} isn’t a PNG, JPEG, GIF or WebP image.`,
    };
  }
  return { ok: true, mimeType };
}

export function checkImageDimensions(
  name: string,
  width: number,
  height: number,
): string | null {
  if (width < 1 || height < 1) {
    return `${name} couldn’t be read as an image.`;
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return `${name} is over ${MAX_IMAGE_DIMENSION.toLocaleString()} px on a side.`;
  }
  return null;
}
