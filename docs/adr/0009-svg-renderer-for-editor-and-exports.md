# 0009 · One SVG renderer for the editor, thumbnails and every export

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

v2 adds vector (SVG) export next to PDF, PNG and JPEG, a richer element set (gradients, shadows, nine shapes, arrows, icons) and live thumbnails on the dashboard. v1 drew the canvas with Konva (HTML canvas), so a vector export would have needed a second renderer that could drift from what users see. The CSP forbids third-party fonts, and `script-src 'self'` must keep working.

## Options considered

1. **Keep Konva and write a separate SVG serialiser for export.** Familiar, but two renderers means two sources of truth for every shape, gradient and text layout.
2. **Render the scene as SVG with React (`DesignSvg`).** The same component draws the editor, thumbnails and (through `renderToStaticMarkup`) the exported SVG; PNG/JPEG rasterise that SVG on a canvas, and PDF embeds the raster.
3. **Write a canvas renderer plus a PDF-native renderer (jsPDF drawing calls).** True vector PDF, but a third code path, and jsPDF's text, gradients and rotation would differ from the screen.

## Decision

Option 2. One renderer, `src/modules/render/DesignSvg.tsx`, with pure geometry in `shapeGeometry.ts` and word wrapping in `document/domain/textLayout.ts` (SVG has no automatic wrapping). Konva and react-konva are removed. `react-dom/server` and jsPDF are dynamically imported, so they only load when someone exports.

## Consequences

- What you see is exactly what you export; SVG export is genuinely vector.
- Editing overlays (handles, guides, marquee) are a second SVG layered on the artboard, in document units, using `vector-effect: non-scaling-stroke`.
- Text metrics come from a canvas `measureText` installed at startup; tests use a deterministic estimate.
- PDF output is a high-resolution raster (up to 384 dpi) inside a vector page. A native-vector PDF would be a follow-up (e.g. svg2pdf) if large-format print matters.
- Fonts are system stacks only, so a design can look slightly different on a machine without, say, Didot. Self-hosted font files would fix this, at the cost of bundle size.
