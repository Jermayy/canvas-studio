import { bounds, type Box } from '@/modules/document/domain/geometry';
import type { DesignDocument } from '@/modules/document/domain/schema';

/**
 * Smart guides: while moving, the selection's edges and centre snap to the
 * canvas edges/centre and to other elements' edges/centres.
 */

export interface SnapTargets {
  x: number[];
  y: number[];
}

export interface Guide {
  axis: 'x' | 'y';
  position: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export function buildSnapTargets(
  document: DesignDocument,
  excludeIds: ReadonlySet<string>,
): SnapTargets {
  const { width, height } = document.format;
  const x = [0, width / 2, width];
  const y = [0, height / 2, height];
  for (const element of document.elements) {
    if (excludeIds.has(element.id) || element.hidden) {
      continue;
    }
    const box = bounds(element);
    x.push(box.x, box.x + box.width / 2, box.x + box.width);
    y.push(box.y, box.y + box.height / 2, box.y + box.height);
  }
  return { x, y };
}

function nearest(
  candidates: readonly number[],
  targets: readonly number[],
  threshold: number,
): { offset: number; position: number } | null {
  let best: { offset: number; position: number } | null = null;
  for (const candidate of candidates) {
    for (const target of targets) {
      const offset = target - candidate;
      if (
        Math.abs(offset) <= threshold &&
        (best === null || Math.abs(offset) < Math.abs(best.offset))
      ) {
        best = { offset, position: target };
      }
    }
  }
  return best;
}

/** Snaps a moving box; `threshold` is in document units. */
export function snapBox(
  box: Box,
  targets: SnapTargets,
  threshold: number,
): SnapResult {
  const snapX = nearest(
    [box.x, box.x + box.width / 2, box.x + box.width],
    targets.x,
    threshold,
  );
  const snapY = nearest(
    [box.y, box.y + box.height / 2, box.y + box.height],
    targets.y,
    threshold,
  );
  const guides: Guide[] = [];
  if (snapX) {
    guides.push({ axis: 'x', position: snapX.position });
  }
  if (snapY) {
    guides.push({ axis: 'y', position: snapY.position });
  }
  return { dx: snapX?.offset ?? 0, dy: snapY?.offset ?? 0, guides };
}
