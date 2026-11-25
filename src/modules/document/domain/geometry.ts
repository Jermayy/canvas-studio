/**
 * Pure geometry for the canvas. Elements are boxes (x, y = top-left of the
 * unrotated box) rotated about their centre, matching the SVG renderer's
 * `rotate(r, cx, cy)`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotatedBox extends Box {
  rotation: number;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Handle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export const MIN_SIZE = 4;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function rotate(point: Point, degrees: number): Point {
  const angle = toRadians(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function corners(box: RotatedBox): Point[] {
  const c = center(box);
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ].map((offset) => {
    const turned = rotate(offset, box.rotation);
    return { x: c.x + turned.x, y: c.y + turned.y };
  });
}

/** Axis-aligned bounds of a (possibly rotated) box. */
export function bounds(box: RotatedBox): Box {
  if (box.rotation % 360 === 0) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  const points = corners(box);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

export function unionBounds(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Normalises a drag from `start` to `end` into a box (marquee selection). */
export function boxFromPoints(start: Point, end: Point): Box {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

const HANDLE_DIRECTIONS: Record<Handle, Point> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

export function isCornerHandle(handle: Handle): boolean {
  return handle.length === 2;
}

/**
 * Resizes a rotated box by dragging one handle to `pointer`, keeping the
 * opposite handle fixed in place. Works in the box's own (rotated) frame so
 * rotated elements resize along their own axes.
 */
export function resizeBox(
  start: RotatedBox,
  handle: Handle,
  pointer: Point,
  options: { keepRatio: boolean; minSize?: number },
): Box {
  const minSize = options.minSize ?? MIN_SIZE;
  const direction = HANDLE_DIRECTIONS[handle];
  const startCenter = center(start);
  const anchorOffset = rotate(
    {
      x: (-direction.x * start.width) / 2,
      y: (-direction.y * start.height) / 2,
    },
    start.rotation,
  );
  const anchor = {
    x: startCenter.x + anchorOffset.x,
    y: startCenter.y + anchorOffset.y,
  };
  const local = rotate(
    { x: pointer.x - anchor.x, y: pointer.y - anchor.y },
    -start.rotation,
  );

  let width =
    direction.x === 0 ? start.width : Math.max(minSize, local.x * direction.x);
  let height =
    direction.y === 0 ? start.height : Math.max(minSize, local.y * direction.y);

  if (options.keepRatio) {
    const scale = isCornerHandle(handle)
      ? Math.max(width / start.width, height / start.height)
      : direction.x === 0
        ? height / start.height
        : width / start.width;
    width = Math.max(minSize, start.width * scale);
    height = Math.max(minSize, start.height * scale);
  }

  // The anchor of an edge handle sits on the box's centre line, so the new
  // centre only moves along the dragged axis.
  const centerOffset = rotate(
    { x: (direction.x * width) / 2, y: (direction.y * height) / 2 },
    start.rotation,
  );
  const nextCenter = {
    x: anchor.x + centerOffset.x,
    y: anchor.y + centerOffset.y,
  };
  return {
    x: nextCenter.x - width / 2,
    y: nextCenter.y - height / 2,
    width,
    height,
  };
}

/** Angle (degrees, 0 = handle straight up) from the box centre to pointer. */
export function rotationFromPointer(
  boxCenter: Point,
  pointer: Point,
  snapDegrees: number | null,
): number {
  const degrees =
    (Math.atan2(pointer.y - boxCenter.y, pointer.x - boxCenter.x) * 180) /
      Math.PI +
    90;
  const snapped =
    snapDegrees === null
      ? degrees
      : Math.round(degrees / snapDegrees) * snapDegrees;
  return normaliseRotation(snapped);
}

/** Maps any angle into (-180, 180] so stored rotations stay small. */
export function normaliseRotation(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  const result = wrapped > 180 ? wrapped - 360 : wrapped;
  return Math.round(result * 100) / 100;
}

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
