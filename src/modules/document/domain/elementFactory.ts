import type { FontId } from '@/modules/document/domain/catalog';
import type {
  DesignDocument,
  Fill,
  IconElement,
  ImageElement,
  LineCap,
  LineElement,
  ShapeElement,
  ShapeKind,
  TextElement,
} from '@/modules/document/domain/schema';
import { SCHEMA_VERSION } from '@/modules/document/domain/schema';
import { withAutoHeight } from '@/modules/document/domain/textLayout';

/**
 * Builders with sensible defaults, so templates, the insert panel and tests
 * only spell out what's different about an element.
 */

type Placement = Partial<
  Pick<
    ShapeElement,
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity' | 'name'
  >
>;

const base = (id: string, placement: Placement) => ({
  id,
  name: placement.name ?? '',
  x: placement.x ?? 0,
  y: placement.y ?? 0,
  width: placement.width ?? 200,
  height: placement.height ?? 200,
  rotation: placement.rotation ?? 0,
  opacity: placement.opacity ?? 1,
  locked: false,
  hidden: false,
});

export function createShape(
  id: string,
  shape: ShapeKind,
  options: Placement &
    Partial<
      Pick<ShapeElement, 'fill' | 'stroke' | 'cornerRadius' | 'shadow'>
    > = {},
): ShapeElement {
  return {
    ...base(id, options),
    type: 'shape',
    shape,
    fill: options.fill ?? { kind: 'solid', color: '#4f46e5' },
    stroke: options.stroke ?? null,
    cornerRadius: options.cornerRadius ?? 0,
    shadow: options.shadow ?? null,
  };
}

export function createLine(
  id: string,
  options: Placement & {
    color?: string;
    strokeWidth?: number;
    dash?: LineElement['stroke']['dash'];
    startCap?: LineCap;
    endCap?: LineCap;
  } = {},
): LineElement {
  const strokeWidth = options.strokeWidth ?? 4;
  return {
    ...base(id, { height: Math.max(strokeWidth, 24), width: 240, ...options }),
    type: 'line',
    stroke: {
      color: options.color ?? '#111827',
      width: strokeWidth,
      dash: options.dash ?? 'solid',
    },
    startCap: options.startCap ?? 'none',
    endCap: options.endCap ?? 'none',
  };
}

export interface TextOptions extends Placement {
  text: string;
  fontFamily?: FontId;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  align?: TextElement['align'];
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  shadow?: TextElement['shadow'];
}

export function createText(id: string, options: TextOptions): TextElement {
  return withAutoHeight({
    ...base(id, { width: 400, height: 10, ...options }),
    type: 'text',
    text: options.text,
    fontFamily: options.fontFamily ?? 'sans',
    fontSize: options.fontSize ?? 32,
    fontWeight: options.fontWeight ?? 400,
    italic: options.italic ?? false,
    align: options.align ?? 'left',
    color: options.color ?? '#111827',
    lineHeight: options.lineHeight ?? 1.25,
    letterSpacing: options.letterSpacing ?? 0,
    uppercase: options.uppercase ?? false,
    shadow: options.shadow ?? null,
  });
}

export function createIcon(
  id: string,
  icon: string,
  options: Placement & { color?: string; strokeWidth?: number } = {},
): IconElement {
  return {
    ...base(id, { width: 96, height: 96, ...options }),
    type: 'icon',
    icon,
    color: options.color ?? '#111827',
    strokeWidth: options.strokeWidth ?? 2,
  };
}

/** Places an image at most 60% of the canvas size, centred, keeping ratio. */
export function createImage(
  id: string,
  asset: { id: string; width: number; height: number; name: string },
  canvas: { width: number; height: number },
): ImageElement {
  const scale = Math.min(
    1,
    (canvas.width * 0.6) / asset.width,
    (canvas.height * 0.6) / asset.height,
  );
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));
  return {
    ...base(id, {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
      name: asset.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80),
    }),
    type: 'image',
    assetId: asset.id,
    fit: 'cover',
    cornerRadius: 0,
    stroke: null,
  };
}

export function createDocument(input: {
  id: string;
  name: string;
  category: DesignDocument['category'];
  format: DesignDocument['format'];
  background?: Fill;
  elements?: DesignDocument['elements'];
  now: string;
}): DesignDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    category: input.category,
    format: input.format,
    background: input.background ?? { kind: 'solid', color: '#ffffff' },
    elements: input.elements ?? [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}
