import type {
  PdfWriter,
  Rasterizer,
} from '@/modules/export/application/exportDesign';
import { ExportError } from '@/modules/export/application/exportDesign';

/** Browser implementations of the export ports (canvas, FileReader, jsPDF). */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new ExportError('Couldn’t read an image.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new ExportError('Couldn’t read an image.'));
    };
    reader.readAsDataURL(blob);
  });
}

export const canvasRasterizer: Rasterizer = {
  rasterize: async ({ svg, width, height, mimeType, quality, background }) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new ExportError(
          'This browser can’t create images. Try SVG instead.',
        );
      }
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(
                new ExportError(
                  'The image was too large to encode. Try a smaller size.',
                ),
              );
            }
          },
          mimeType,
          quality,
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

const PX_TO_PT = 0.75;

export const jsPdfWriter: PdfWriter = {
  write: async ({ image, width, height, title }) => {
    // Loaded on demand: jsPDF is the largest dependency in the bundle.
    const { jsPDF } = await import('jspdf');
    const pageWidth = width * PX_TO_PT;
    const pageHeight = height * PX_TO_PT;
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pageWidth, pageHeight],
      compress: true,
    });
    pdf.setProperties({ title, creator: 'Canvas Studio' });
    pdf.addImage(
      new Uint8Array(await image.arrayBuffer()),
      'PNG',
      0,
      0,
      pageWidth,
      pageHeight,
      undefined,
      'FAST',
    );
    return pdf.output('blob');
  },
};

/** Reads an image's pixel size without decoding it onto the page. */
export async function readImageSize(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
