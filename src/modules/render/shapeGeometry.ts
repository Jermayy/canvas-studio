import type { Fill, ShapeKind, Stroke } from '@/modules/document/domain/schema';

/**
 * SVG geometry for shapes, line styles and gradients. Every shape is drawn
 * as a path that exactly fills its box, so resizing stretches it the same
 * way on the canvas and in exports.
 */

type Vertex = [number, number];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function polygonPath(points: readonly Vertex[]): string {
  return `${points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`)
    .join(' ')} Z`;
}

/** Points on alternating radii, scaled to fill the box exactly. */
function radialPolygon(
  points: number,
  innerRatio: number,
  width: number,
  height: number,
): Vertex[] {
  const count = innerRatio === 1 ? points : points * 2;
  const raw: Vertex[] = Array.from({ length: count }, (_, index) => {
    const radius = innerRatio !== 1 && index % 2 === 1 ? innerRatio : 1;
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  return raw.map(([x, y]) => [
    ((x - minX) / spanX) * width,
    ((y - minY) / spanY) * height,
  ]);
}

function roundedRectPath(
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    return `M0 0 H${round(width)} V${round(height)} H0 Z`;
  }
  return [
    `M${round(r)} 0`,
    `H${round(width - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(width)} ${round(r)}`,
    `V${round(height - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(width - r)} ${round(height)}`,
    `H${round(r)}`,
    `A${round(r)} ${round(r)} 0 0 1 0 ${round(height - r)}`,
    `V${round(r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(r)} 0`,
    'Z',
  ].join(' ');
}

function ellipsePath(width: number, height: number): string {
  const rx = round(width / 2);
  const ry = round(height / 2);
  return `M0 ${ry} A${rx} ${ry} 0 1 0 ${round(width)} ${ry} A${rx} ${ry} 0 1 0 0 ${ry} Z`;
}

const HEART: readonly number[][] = [
  [0.5, 0.25],
  [0.5, 0.1, 0.35, 0, 0.22, 0],
  [0.1, 0, 0, 0.12, 0, 0.3],
  [0, 0.58, 0.3, 0.78, 0.5, 1],
  [0.7, 0.78, 1, 0.58, 1, 0.3],
  [1, 0.12, 0.9, 0, 0.78, 0],
  [0.65, 0, 0.5, 0.1, 0.5, 0.25],
];

function heartPath(width: number, height: number): string {
  const scale = (values: readonly number[]) =>
    values
      .map((value, index) => round(value * (index % 2 === 0 ? width : height)))
      .join(' ');
  const [start = [], ...curves] = HEART;
  return `M${scale(start)} ${curves.map((curve) => `C${scale(curve)}`).join(' ')} Z`;
}

export function shapePath(
  shape: ShapeKind,
  width: number,
  height: number,
  cornerRadius = 0,
): string {
  switch (shape) {
    case 'rectangle':
      return roundedRectPath(width, height, cornerRadius);
    case 'ellipse':
      return ellipsePath(width, height);
    case 'triangle':
      return polygonPath([
        [width / 2, 0],
        [width, height],
        [0, height],
      ]);
    case 'diamond':
      return polygonPath([
        [width / 2, 0],
        [width, height / 2],
        [width / 2, height],
        [0, height / 2],
      ]);
    case 'pentagon':
      return polygonPath(radialPolygon(5, 1, width, height));
    case 'hexagon':
      return polygonPath(radialPolygon(6, 1, width, height));
    case 'star':
      return polygonPath(radialPolygon(5, 0.45, width, height));
    case 'burst':
      return polygonPath(radialPolygon(16, 0.82, width, height));
    case 'heart':
      return heartPath(width, height);
  }
}

export function dashArray(stroke: Stroke): string | undefined {
  switch (stroke.dash) {
    case 'solid':
      return undefined;
    case 'dashed':
      return `${round(stroke.width * 3)} ${round(stroke.width * 2)}`;
    case 'dotted':
      // Zero-length dashes with round caps draw dots.
      return `0 ${round(stroke.width * 2)}`;
  }
}

/** CSS-style angle (0 = to top, 90 = to right) → SVG gradient vector. */
export function gradientVector(angle: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;
  return {
    x1: round(0.5 - dx),
    y1: round(0.5 - dy),
    x2: round(0.5 + dx),
    y2: round(0.5 + dy),
  };
}

export function fillPaint(fill: Fill, gradientId: string): string {
  switch (fill.kind) {
    case 'none':
      return 'none';
    case 'solid':
      return fill.color;
    case 'linear':
      return `url(#${gradientId})`;
  }
}
