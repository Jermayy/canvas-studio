/**
 * Fixed vocabularies the document schema validates against: fonts, template
 * categories and canvas formats. Fonts are system stacks only — the CSP
 * allows no third-party font hosts, and exported SVGs must render the same
 * way in other apps.
 */

export const FONTS = [
  {
    id: 'sans',
    label: 'Sans',
    stack:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    id: 'avenir',
    label: 'Avenir',
    stack: '"Avenir Next", Avenir, "Century Gothic", "Segoe UI", sans-serif',
  },
  {
    id: 'futura',
    label: 'Futura',
    stack: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif',
  },
  {
    id: 'rounded',
    label: 'Rounded',
    stack:
      'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
  },
  {
    id: 'display',
    label: 'Impact',
    stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    id: 'didot',
    label: 'Didot',
    stack: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    stack: 'Garamond, "Hoefler Text", "Times New Roman", serif',
  },
  {
    id: 'script',
    label: 'Script',
    stack: '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive',
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
] as const;

export type FontId = (typeof FONTS)[number]['id'];
export const FONT_IDS = FONTS.map((font) => font.id) as [FontId, ...FontId[]];

export function fontById(id: FontId): (typeof FONTS)[number] {
  return FONTS.find((font) => font.id === id) ?? FONTS[0];
}

export const CATEGORIES = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'christmas', label: 'Christmas' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'conference', label: 'Conference' },
  { id: 'party', label: 'Party' },
  { id: 'blank', label: 'Blank' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS = CATEGORIES.map((category) => category.id) as [
  CategoryId,
  ...CategoryId[],
];

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

/** Sizes are CSS pixels (96 dpi); print formats export at up to 4×. */
export const FORMATS = [
  {
    id: 'a4',
    label: 'A4 poster',
    detail: '210 × 297 mm',
    width: 794,
    height: 1123,
  },
  {
    id: 'letter',
    label: 'Letter flyer',
    detail: '8.5 × 11 in',
    width: 816,
    height: 1056,
  },
  {
    id: 'invite',
    label: 'Invitation',
    detail: '5 × 7 in',
    width: 480,
    height: 672,
  },
  {
    id: 'square',
    label: 'Square post',
    detail: '1080 × 1080',
    width: 1080,
    height: 1080,
  },
  {
    id: 'portrait',
    label: 'Portrait post',
    detail: '1080 × 1350',
    width: 1080,
    height: 1350,
  },
  {
    id: 'story',
    label: 'Story',
    detail: '1080 × 1920',
    width: 1080,
    height: 1920,
  },
  {
    id: 'slide',
    label: 'Presentation',
    detail: '1920 × 1080',
    width: 1920,
    height: 1080,
  },
  {
    id: 'banner',
    label: 'Web banner',
    detail: '1500 × 500',
    width: 1500,
    height: 500,
  },
] as const;

export type FormatId = (typeof FORMATS)[number]['id'];

export function formatById(id: string): (typeof FORMATS)[number] | undefined {
  return FORMATS.find((format) => format.id === id);
}
