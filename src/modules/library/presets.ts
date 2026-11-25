import {
  createIcon,
  createLine,
  createShape,
  createText,
  type TextOptions,
} from '@/modules/document/domain/elementFactory';
import { iconById } from '@/modules/library/iconCatalog';
import type {
  DesignElement,
  Fill,
  ShapeKind,
} from '@/modules/document/domain/schema';

/**
 * Everything the insert panel offers, as data. A preset knows how to build
 * its element at a position, which is shared by click-to-add (centre of
 * the canvas) and drag-and-drop (drop point).
 */

export interface Preset {
  id: string;
  label: string;
  build: (id: string) => DesignElement;
}

const textPreset = (
  id: string,
  label: string,
  options: TextOptions,
): Preset => ({
  id,
  label,
  build: (elementId) => createText(elementId, options),
});

export const TEXT_PRESETS: readonly Preset[] = [
  textPreset('text-heading', 'Heading', {
    text: 'Add a heading',
    fontSize: 72,
    fontWeight: 800,
    width: 640,
    lineHeight: 1.1,
  }),
  textPreset('text-subheading', 'Subheading', {
    text: 'Add a subheading',
    fontSize: 40,
    fontWeight: 600,
    width: 560,
  }),
  textPreset('text-body', 'Body text', {
    text: 'Add a little bit of body text to explain the details.',
    fontSize: 24,
    width: 480,
    lineHeight: 1.45,
  }),
  textPreset('text-label', 'Label', {
    text: 'EVENT LABEL',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 6,
    uppercase: true,
    width: 360,
  }),
];

export const TEXT_COMBOS: readonly Preset[] = [
  textPreset('combo-elegant', 'Elegant serif', {
    text: 'An Evening to Remember',
    fontFamily: 'didot',
    fontSize: 64,
    italic: true,
    align: 'center',
    width: 640,
  }),
  textPreset('combo-script', 'Script', {
    text: 'Happy Birthday',
    fontFamily: 'script',
    fontSize: 88,
    align: 'center',
    color: '#be185d',
    width: 640,
  }),
  textPreset('combo-display', 'Bold display', {
    text: 'SUMMER PARTY',
    fontFamily: 'display',
    fontSize: 110,
    align: 'center',
    width: 760,
    lineHeight: 1,
  }),
  textPreset('combo-modern', 'Modern', {
    text: 'Product Summit 2027',
    fontFamily: 'avenir',
    fontSize: 56,
    fontWeight: 700,
    letterSpacing: -1,
    width: 640,
  }),
  textPreset('combo-mono', 'Technical', {
    text: '09:00 — Registration',
    fontFamily: 'mono',
    fontSize: 28,
    width: 480,
  }),
];

const SHAPE_OPTIONS: Record<
  ShapeKind,
  { label: string; width: number; height: number }
> = {
  rectangle: { label: 'Rectangle', width: 280, height: 180 },
  ellipse: { label: 'Circle', width: 220, height: 220 },
  triangle: { label: 'Triangle', width: 240, height: 210 },
  diamond: { label: 'Diamond', width: 220, height: 220 },
  pentagon: { label: 'Pentagon', width: 230, height: 220 },
  hexagon: { label: 'Hexagon', width: 240, height: 210 },
  star: { label: 'Star', width: 240, height: 230 },
  burst: { label: 'Badge', width: 240, height: 240 },
  heart: { label: 'Heart', width: 240, height: 220 },
};

export const SHAPE_PRESETS: readonly Preset[] = (
  Object.keys(SHAPE_OPTIONS) as ShapeKind[]
).map((shape) => ({
  id: `shape-${shape}`,
  label: SHAPE_OPTIONS[shape].label,
  build: (elementId) =>
    createShape(elementId, shape, {
      width: SHAPE_OPTIONS[shape].width,
      height: SHAPE_OPTIONS[shape].height,
    }),
}));

export const EXTRA_SHAPE_PRESETS: readonly Preset[] = [
  {
    id: 'shape-rounded',
    label: 'Rounded card',
    build: (elementId) =>
      createShape(elementId, 'rectangle', {
        width: 320,
        height: 200,
        cornerRadius: 28,
        fill: { kind: 'solid', color: '#ffffff' },
        shadow: {
          color: '#0f172a',
          opacity: 0.18,
          blur: 30,
          offsetX: 0,
          offsetY: 12,
        },
      }),
  },
  {
    id: 'shape-pill',
    label: 'Pill tag',
    build: (elementId) =>
      createShape(elementId, 'rectangle', {
        width: 260,
        height: 64,
        cornerRadius: 32,
        fill: { kind: 'solid', color: '#f59e0b' },
      }),
  },
  {
    id: 'shape-ring',
    label: 'Outline ring',
    build: (elementId) =>
      createShape(elementId, 'ellipse', {
        width: 240,
        height: 240,
        fill: { kind: 'none' },
        stroke: { color: '#4f46e5', width: 8, dash: 'solid' },
      }),
  },
  {
    id: 'shape-gradient',
    label: 'Gradient panel',
    build: (elementId) =>
      createShape(elementId, 'rectangle', {
        width: 360,
        height: 240,
        cornerRadius: 16,
        fill: { kind: 'linear', from: '#6366f1', to: '#ec4899', angle: 135 },
      }),
  },
];

export const LINE_PRESETS: readonly Preset[] = [
  {
    id: 'line-solid',
    label: 'Line',
    build: (elementId) => createLine(elementId, {}),
  },
  {
    id: 'line-dashed',
    label: 'Dashed line',
    build: (elementId) => createLine(elementId, { dash: 'dashed' }),
  },
  {
    id: 'line-dotted',
    label: 'Dotted line',
    build: (elementId) =>
      createLine(elementId, { dash: 'dotted', strokeWidth: 6 }),
  },
  {
    id: 'line-arrow',
    label: 'Arrow',
    build: (elementId) => createLine(elementId, { endCap: 'arrow' }),
  },
  {
    id: 'line-double-arrow',
    label: 'Double arrow',
    build: (elementId) =>
      createLine(elementId, { startCap: 'arrow', endCap: 'arrow' }),
  },
  {
    id: 'line-connector',
    label: 'Connector',
    build: (elementId) =>
      createLine(elementId, { startCap: 'circle', endCap: 'circle' }),
  },
];

export function iconPreset(iconId: string, label: string): Preset {
  return {
    id: `icon-${iconId}`,
    label,
    build: (elementId) => createIcon(elementId, iconId),
  };
}

export const SWATCHES: readonly string[] = [
  '#111827',
  '#374151',
  '#9ca3af',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#4f46e5',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#fde68a',
  '#fbcfe8',
  '#bfdbfe',
  '#14532d',
];

export const BACKGROUND_PRESETS: readonly { label: string; fill: Fill }[] = [
  { label: 'White', fill: { kind: 'solid', color: '#ffffff' } },
  { label: 'Ivory', fill: { kind: 'solid', color: '#fdf8f3' } },
  { label: 'Midnight', fill: { kind: 'solid', color: '#0f172a' } },
  { label: 'Forest', fill: { kind: 'solid', color: '#14532d' } },
  { label: 'Berry', fill: { kind: 'solid', color: '#831843' } },
  {
    label: 'Sunset',
    fill: { kind: 'linear', from: '#f97316', to: '#db2777', angle: 160 },
  },
  {
    label: 'Aurora',
    fill: { kind: 'linear', from: '#4f46e5', to: '#06b6d4', angle: 120 },
  },
  {
    label: 'Royal',
    fill: { kind: 'linear', from: '#1e1b4b', to: '#6d28d9', angle: 160 },
  },
  {
    label: 'Festive',
    fill: { kind: 'linear', from: '#b91c1c', to: '#7f1d1d', angle: 180 },
  },
  {
    label: 'Champagne',
    fill: { kind: 'linear', from: '#fef3c7', to: '#fbcfe8', angle: 135 },
  },
  {
    label: 'Mint',
    fill: { kind: 'linear', from: '#ecfdf5', to: '#a7f3d0', angle: 180 },
  },
  {
    label: 'Graphite',
    fill: { kind: 'linear', from: '#374151', to: '#111827', angle: 180 },
  },
];

/** Drag-and-drop payloads carry a preset id; this resolves it. */
export const PRESET_MIME = 'application/x-canvas-studio-preset';

export function findPreset(id: string): Preset | undefined {
  const fixed = [
    ...TEXT_PRESETS,
    ...TEXT_COMBOS,
    ...SHAPE_PRESETS,
    ...EXTRA_SHAPE_PRESETS,
    ...LINE_PRESETS,
  ].find((preset) => preset.id === id);
  if (fixed) {
    return fixed;
  }
  const iconId = id.startsWith('icon-') ? id.slice('icon-'.length) : null;
  const icon = iconId ? iconById(iconId) : undefined;
  return icon ? iconPreset(icon.id, icon.label) : undefined;
}
