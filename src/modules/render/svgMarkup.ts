import type { SvgRenderer } from '@/modules/export/application/exportDesign';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Serialises the canvas renderer to a standalone SVG file, so exports are
 * drawn by exactly the same code as the editor.
 */
export const svgRenderer: SvgRenderer = {
  render: (document, assetUrls, { width, height, transparent }) =>
    Promise.resolve(
      `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(
        createElement(DesignSvg, {
          document,
          assetUrls,
          width,
          height,
          transparent,
          title: document.name,
        }),
      )}`,
    ),
};
