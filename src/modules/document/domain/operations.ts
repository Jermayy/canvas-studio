import {
  bounds,
  unionBounds,
  type Box,
} from '@/modules/document/domain/geometry';
import {
  MAX_ELEMENTS,
  parseElement,
  type DesignDocument,
  type DesignElement,
  type ElementPatch,
  type Fill,
  DocumentValidationError,
} from '@/modules/document/domain/schema';
import { withAutoHeight } from '@/modules/document/domain/textLayout';

/**
 * Pure document operations. Each returns a new document and leaves the
 * input untouched, which is what makes undo/redo and optimistic saving
 * simple. Elements are listed bottom-to-top (last = front-most).
 */

export type Alignment =
  'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';
export type DistributeAxis = 'horizontal' | 'vertical';

function normalise(element: DesignElement): DesignElement {
  const parsed = parseElement(element);
  return parsed.type === 'text' ? withAutoHeight(parsed) : parsed;
}

export function findElement(
  document: DesignDocument,
  id: string,
): DesignElement | undefined {
  return document.elements.find((element) => element.id === id);
}

export function addElements(
  document: DesignDocument,
  elements: readonly DesignElement[],
): DesignDocument {
  if (document.elements.length + elements.length > MAX_ELEMENTS) {
    throw new DocumentValidationError('Too many elements', [
      `A design can hold up to ${MAX_ELEMENTS} elements.`,
    ]);
  }
  return {
    ...document,
    elements: [...document.elements, ...elements.map(normalise)],
  };
}

export function updateElements(
  document: DesignDocument,
  ids: readonly string[],
  patch: ElementPatch | ((element: DesignElement) => ElementPatch),
): DesignDocument {
  const targets = new Set(ids);
  const elements = document.elements.map((element) => {
    if (!targets.has(element.id)) {
      return element;
    }
    const changes = typeof patch === 'function' ? patch(element) : patch;
    // The schema strips keys that don't belong to this element kind.
    return normalise({ ...element, ...changes } as DesignElement);
  });
  const changed = elements.some(
    (element, index) => element !== document.elements[index],
  );
  return changed ? { ...document, elements } : document;
}

export function removeElements(
  document: DesignDocument,
  ids: readonly string[],
): DesignDocument {
  const targets = new Set(ids);
  const elements = document.elements.filter(
    (element) => !targets.has(element.id),
  );
  return elements.length === document.elements.length
    ? document
    : { ...document, elements };
}

export function duplicateElements(
  document: DesignDocument,
  ids: readonly string[],
  createId: () => string,
  offset = 24,
): { document: DesignDocument; ids: string[] } {
  const targets = new Set(ids);
  const copies = document.elements
    .filter((element) => targets.has(element.id))
    .map((element) => ({
      ...element,
      id: createId(),
      name: element.name ? `${element.name} copy`.slice(0, 80) : '',
      x: element.x + offset,
      y: element.y + offset,
      locked: false,
    }));
  return {
    document: addElements(document, copies),
    ids: copies.map((copy) => copy.id),
  };
}

export function reorderElements(
  document: DesignDocument,
  ids: readonly string[],
  direction: ReorderDirection,
): DesignDocument {
  const targets = new Set(ids);
  const selected = document.elements.filter((element) =>
    targets.has(element.id),
  );
  const rest = document.elements.filter((element) => !targets.has(element.id));
  if (selected.length === 0) {
    return document;
  }
  if (direction === 'front') {
    return { ...document, elements: [...rest, ...selected] };
  }
  if (direction === 'back') {
    return { ...document, elements: [...selected, ...rest] };
  }
  const elements = [...document.elements];
  const step = direction === 'forward' ? 1 : -1;
  const order =
    direction === 'forward'
      ? [...elements.keys()].reverse()
      : [...elements.keys()];
  for (const index of order) {
    const current = elements[index];
    const neighbour = elements[index + step];
    if (
      current &&
      neighbour &&
      targets.has(current.id) &&
      !targets.has(neighbour.id)
    ) {
      elements[index] = neighbour;
      elements[index + step] = current;
    }
  }
  return { ...document, elements };
}

/** Moves one element to an absolute stack index (layer drag and drop). */
export function moveElementTo(
  document: DesignDocument,
  id: string,
  index: number,
): DesignDocument {
  const from = document.elements.findIndex((element) => element.id === id);
  const element = document.elements[from];
  if (!element) {
    return document;
  }
  const target = Math.max(0, Math.min(document.elements.length - 1, index));
  if (target === from) {
    return document;
  }
  const elements = document.elements.filter((item) => item.id !== id);
  elements.splice(target, 0, element);
  return { ...document, elements };
}

function selectedBounds(
  document: DesignDocument,
  ids: ReadonlySet<string>,
): Map<string, Box> {
  return new Map(
    document.elements
      .filter((element) => ids.has(element.id))
      .map((element) => [element.id, bounds(element)]),
  );
}

/**
 * Aligns elements to the canvas (one element) or to their shared bounds
 * (several). Uses rotated bounds so rotated elements line up visually.
 */
export function alignElements(
  document: DesignDocument,
  ids: readonly string[],
  alignment: Alignment,
): DesignDocument {
  const boxes = selectedBounds(document, new Set(ids));
  const frame =
    boxes.size > 1
      ? unionBounds([...boxes.values()])
      : {
          x: 0,
          y: 0,
          width: document.format.width,
          height: document.format.height,
        };
  if (!frame) {
    return document;
  }
  return updateElements(document, [...boxes.keys()], (element) => {
    const box = boxes.get(element.id);
    if (!box) {
      return {};
    }
    switch (alignment) {
      case 'left':
        return { x: element.x + frame.x - box.x };
      case 'center':
        return {
          x: element.x + frame.x + (frame.width - box.width) / 2 - box.x,
        };
      case 'right':
        return { x: element.x + frame.x + frame.width - box.width - box.x };
      case 'top':
        return { y: element.y + frame.y - box.y };
      case 'middle':
        return {
          y: element.y + frame.y + (frame.height - box.height) / 2 - box.y,
        };
      case 'bottom':
        return { y: element.y + frame.y + frame.height - box.height - box.y };
    }
  });
}

/** Spaces three or more elements evenly between the outermost two. */
export function distributeElements(
  document: DesignDocument,
  ids: readonly string[],
  axis: DistributeAxis,
): DesignDocument {
  const boxes = selectedBounds(document, new Set(ids));
  if (boxes.size < 3) {
    return document;
  }
  const start = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'width' : 'height';
  const sorted = [...boxes.entries()].sort(
    ([, a], [, b]) => a[start] - b[start],
  );
  const first = sorted[0]?.[1];
  const last = sorted.at(-1)?.[1];
  if (!first || !last) {
    return document;
  }
  const occupied = sorted.reduce((sum, [, box]) => sum + box[size], 0);
  const gap =
    (last[start] + last[size] - first[start] - occupied) / (sorted.length - 1);
  const targets = new Map<string, number>();
  let cursor = first[start];
  for (const [id, box] of sorted) {
    targets.set(id, cursor - box[start]);
    cursor += box[size] + gap;
  }
  return updateElements(document, [...targets.keys()], (element) => {
    const delta = targets.get(element.id) ?? 0;
    return axis === 'horizontal'
      ? { x: element.x + delta }
      : { y: element.y + delta };
  });
}

export interface DocumentPropsPatch {
  name?: string;
  background?: Fill;
  category?: DesignDocument['category'];
  format?: DesignDocument['format'];
}

export function updateDocumentProps(
  document: DesignDocument,
  patch: DocumentPropsPatch,
): DesignDocument {
  const name = patch.name?.trim();
  return {
    ...document,
    ...patch,
    name: name && name.length > 0 ? name.slice(0, 120) : document.name,
  };
}
