import {
  bounds,
  boxFromPoints,
  center,
  intersects,
  isCornerHandle,
  resizeBox,
  rotationFromPointer,
  roundTo,
  unionBounds,
  type Box,
  type Handle,
  type Point,
} from '@/modules/document/domain/geometry';
import { updateElements } from '@/modules/document/domain/operations';
import type {
  DesignElement,
  ElementPatch,
} from '@/modules/document/domain/schema';
import {
  buildSnapTargets,
  snapBox,
  type SnapTargets,
} from '@/modules/document/domain/snapping';
import type { StudioStore } from '@/modules/studio/state/studioStore';
import { useRef, type PointerEvent, type RefObject } from 'react';

/**
 * Pointer gestures on the canvas. Gesture state lives in a ref (no
 * re-render per pointer move); document changes go through the store's
 * gesture API so each drag is a single undo step.
 */

type Gesture =
  | {
      kind: 'move';
      started: boolean;
      origin: Point;
      ids: string[];
      startBounds: Box;
      targets: SnapTargets;
    }
  | { kind: 'resize'; handle: Handle; element: DesignElement }
  | { kind: 'rotate'; element: DesignElement; pivot: Point }
  | { kind: 'marquee'; origin: Point; base: readonly string[] };

const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 6;
const ROTATION_SNAP_DEGREES = 15;

function resizePatch(
  element: DesignElement,
  handle: Handle,
  pointer: Point,
  shiftKey: boolean,
): ElementPatch {
  // Images and icons keep their proportions by default; Shift frees them.
  const proportional = element.type === 'image' || element.type === 'icon';
  const keepRatio =
    isCornerHandle(handle) && (proportional ? !shiftKey : shiftKey);
  const box = resizeBox(element, handle, pointer, { keepRatio });
  const rounded = {
    x: roundTo(box.x, 1),
    y: roundTo(box.y, 1),
    width: roundTo(box.width, 1),
    height: roundTo(box.height, 1),
  };
  if (element.type === 'text') {
    // Text height follows its content; corner handles scale the type.
    return isCornerHandle(handle)
      ? {
          x: rounded.x,
          y: rounded.y,
          width: rounded.width,
          fontSize: roundTo(
            Math.max(4, element.fontSize * (box.width / element.width)),
            1,
          ),
        }
      : { x: rounded.x, width: rounded.width };
  }
  if (element.type === 'line') {
    return { x: rounded.x, y: rounded.y, width: rounded.width };
  }
  return rounded;
}

export function useCanvasGestures(options: {
  store: StudioStore;
  artboardRef: RefObject<HTMLDivElement | null>;
  snapping: boolean;
  onMarquee: (box: Box | null) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const { store, artboardRef, snapping, onMarquee } = options;

  const toDocument = (event: { clientX: number; clientY: number }): Point => {
    const rect = artboardRef.current?.getBoundingClientRect();
    const zoom = store.getState().zoom;
    return {
      x: (event.clientX - (rect?.left ?? 0)) / zoom,
      y: (event.clientY - (rect?.top ?? 0)) / zoom,
    };
  };

  const elementIdAt = (target: EventTarget): string | null =>
    target instanceof Element
      ? (target.closest('[data-element-id]')?.getAttribute('data-element-id') ??
        null)
      : null;

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return;
    }
    if (event.target.closest('[data-text-editor]')) {
      return;
    }
    const state = store.getState();
    if (state.editingTextId) {
      return;
    }
    const point = toDocument(event);
    const document = state.history.present;
    const handle = event.target
      .closest('[data-handle]')
      ?.getAttribute('data-handle');
    const selected = document.elements.find(
      (element) => element.id === state.selection[0],
    );

    if (handle && selected && state.selection.length === 1) {
      gesture.current =
        handle === 'rotate'
          ? { kind: 'rotate', element: selected, pivot: center(selected) }
          : { kind: 'resize', handle: handle as Handle, element: selected };
      state.beginGesture();
    } else {
      const id = elementIdAt(event.target);
      if (id) {
        if (event.shiftKey) {
          state.toggleSelection(id);
          return;
        }
        if (!state.selection.includes(id)) {
          state.select([id]);
        }
        const selection = new Set(store.getState().selection);
        const movable = document.elements.filter(
          (element) => selection.has(element.id) && !element.locked,
        );
        const startBounds = unionBounds(movable.map(bounds));
        if (!startBounds) {
          return;
        }
        gesture.current = {
          kind: 'move',
          started: false,
          origin: point,
          ids: movable.map((element) => element.id),
          startBounds,
          targets: buildSnapTargets(document, selection),
        };
      } else {
        if (!event.shiftKey) {
          state.clearSelection();
        }
        gesture.current = {
          kind: 'marquee',
          origin: point,
          base: event.shiftKey ? state.selection : [],
        };
      }
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = store.getState();
    const current = gesture.current;
    if (!current) {
      const id = elementIdAt(event.target);
      if (id !== state.hoveredId) {
        state.setHovered(id);
      }
      return;
    }
    const point = toDocument(event);
    switch (current.kind) {
      case 'move': {
        let dx = point.x - current.origin.x;
        let dy = point.y - current.origin.y;
        if (!current.started) {
          if (Math.hypot(dx, dy) * state.zoom < DRAG_THRESHOLD_PX) {
            return;
          }
          current.started = true;
          state.beginGesture();
        }
        if (snapping && !event.altKey) {
          const snap = snapBox(
            {
              ...current.startBounds,
              x: current.startBounds.x + dx,
              y: current.startBounds.y + dy,
            },
            current.targets,
            SNAP_THRESHOLD_PX / state.zoom,
          );
          dx += snap.dx;
          dy += snap.dy;
          state.setGuides(snap.guides);
        } else if (state.guides.length > 0) {
          state.setGuides([]);
        }
        const ids = current.ids;
        state.previewGesture((start) =>
          updateElements(start, ids, (element) => ({
            x: roundTo(element.x + dx, 1),
            y: roundTo(element.y + dy, 1),
          })),
        );
        return;
      }
      case 'resize': {
        const patch = resizePatch(
          current.element,
          current.handle,
          point,
          event.shiftKey,
        );
        const id = current.element.id;
        state.previewGesture((start) => updateElements(start, [id], patch));
        return;
      }
      case 'rotate': {
        const rotation = rotationFromPointer(
          current.pivot,
          point,
          event.shiftKey ? ROTATION_SNAP_DEGREES : null,
        );
        const id = current.element.id;
        state.previewGesture((start) =>
          updateElements(start, [id], { rotation }),
        );
        return;
      }
      case 'marquee':
        onMarquee(boxFromPoints(current.origin, point));
        return;
    }
  };

  const finish = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!current) {
      return;
    }
    const state = store.getState();
    if (current.kind === 'marquee') {
      onMarquee(null);
      if (cancelled) {
        return;
      }
      const box = boxFromPoints(current.origin, toDocument(event));
      if (
        box.width * state.zoom < DRAG_THRESHOLD_PX &&
        box.height * state.zoom < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      const hits = state.history.present.elements
        .filter(
          (element) => !element.hidden && intersects(bounds(element), box),
        )
        .map((element) => element.id);
      state.select([...new Set([...current.base, ...hits])]);
      return;
    }
    if (current.kind === 'move' && !current.started) {
      return;
    }
    if (cancelled) {
      state.cancelGesture();
    } else {
      state.endGesture();
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      finish(event, false);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      finish(event, true);
    },
    onPointerLeave: () => {
      if (!gesture.current && store.getState().hoveredId !== null) {
        store.getState().setHovered(null);
      }
    },
    onDoubleClick: (event: { target: EventTarget }) => {
      const id = elementIdAt(event.target);
      if (id) {
        store.getState().startTextEdit(id);
      }
    },
    toDocument,
  };
}
