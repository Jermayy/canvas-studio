import { fontById } from '@/modules/document/domain/catalog';
import type {
  DesignElement,
  Fill,
  ShapeKind,
} from '@/modules/document/domain/schema';

/**
 * Human-readable layer descriptions: what each element is, what it looks
 * like and what state it's in, so the Layers panel, status bar and screen
 * readers all say the same thing.
 */

export interface LayerDescription {
  title: string;
  kind: string;
  detail: string;
  notes: string[];
}

const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  star: 'Star',
  burst: 'Badge burst',
  heart: 'Heart',
};

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

export function shapeLabel(shape: ShapeKind): string {
  return SHAPE_LABELS[shape];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function describeFill(fill: Fill): string {
  switch (fill.kind) {
    case 'none':
      return 'No fill';
    case 'solid':
      return `Fill ${fill.color.toUpperCase()}`;
    case 'linear':
      return `Gradient ${fill.from.toUpperCase()} → ${fill.to.toUpperCase()}`;
  }
}

function defaultTitle(
  element: DesignElement,
  iconLabel: (id: string) => string,
): string {
  switch (element.type) {
    case 'text': {
      const firstLine =
        element.text.split('\n').find((line) => line.trim()) ?? '';
      return firstLine ? `“${truncate(firstLine.trim(), 28)}”` : 'Empty text';
    }
    case 'shape':
      return SHAPE_LABELS[element.shape];
    case 'line':
      return element.startCap === 'arrow' || element.endCap === 'arrow'
        ? 'Arrow'
        : 'Line';
    case 'icon':
      return `${iconLabel(element.icon)} icon`;
    case 'image':
      return 'Image';
  }
}

function kindAndDetail(element: DesignElement): {
  kind: string;
  detail: string;
} {
  switch (element.type) {
    case 'text':
      return {
        kind: 'Text',
        detail: `${fontById(element.fontFamily).label} · ${Math.round(element.fontSize)}px · ${WEIGHT_LABELS[element.fontWeight] ?? element.fontWeight}`,
      };
    case 'shape':
      return {
        kind: 'Shape',
        detail: element.stroke
          ? `${describeFill(element.fill)} · ${element.stroke.width}px outline`
          : describeFill(element.fill),
      };
    case 'line':
      return {
        kind: 'Line',
        detail: `${element.stroke.width}px ${element.stroke.dash} · ${element.stroke.color.toUpperCase()}`,
      };
    case 'icon':
      return { kind: 'Icon', detail: element.color.toUpperCase() };
    case 'image':
      return {
        kind: 'Image',
        detail: `${element.fit === 'cover' ? 'Fills frame' : 'Fits inside frame'} · ${Math.round(element.width)}×${Math.round(element.height)}`,
      };
  }
}

export function describeElement(
  element: DesignElement,
  iconLabel: (id: string) => string,
): LayerDescription {
  const notes: string[] = [];
  if (element.hidden) {
    notes.push('Hidden — not shown or exported');
  }
  if (element.locked) {
    notes.push('Locked — can’t be moved, resized or deleted');
  }
  if (element.opacity < 1) {
    notes.push(`${Math.round(element.opacity * 100)}% opacity`);
  }
  const custom = element.name.trim();
  return {
    title: custom || defaultTitle(element, iconLabel),
    ...kindAndDetail(element),
    notes,
  };
}

/** Index 0 is the bottom of the stack. */
export function stackPositionLabel(index: number, total: number): string {
  if (total <= 1) {
    return 'Only layer';
  }
  if (index === total - 1) {
    return 'Front-most layer';
  }
  if (index === 0) {
    return 'Back-most layer';
  }
  return `Layer ${total - index} of ${total} from the front`;
}
