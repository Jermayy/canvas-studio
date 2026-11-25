import type { Point } from '@/modules/document/domain/geometry';
import {
  createHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from '@/modules/document/domain/history';
import {
  addElements,
  alignElements,
  distributeElements,
  duplicateElements,
  moveElementTo,
  removeElements,
  reorderElements,
  updateDocumentProps,
  updateElements,
  type Alignment,
  type DistributeAxis,
  type DocumentPropsPatch,
  type ReorderDirection,
} from '@/modules/document/domain/operations';
import {
  DocumentValidationError,
  type DesignDocument,
  type DesignElement,
  type ElementPatch,
} from '@/modules/document/domain/schema';
import type { Guide } from '@/modules/document/domain/snapping';
import type { Logger } from '@/shared/logger';
import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Editor state for one open design: the document with undo history,
 * selection, transient canvas state (guides, hover, text editing) and
 * zoom. Every edit goes through `commit`, which validates, records history
 * and hands the result to the workspace for optimistic saving.
 */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export type Notify = (
  message: string,
  tone?: 'info' | 'warning' | 'error',
) => void;

export interface StudioState {
  history: History<DesignDocument>;
  selection: readonly string[];
  hoveredId: string | null;
  editingTextId: string | null;
  guides: readonly Guide[];
  zoom: number;
  /** True while zoom follows the viewport size. */
  fitToScreen: boolean;
  /** Document before the current drag/resize/rotate began. */
  gestureStart: DesignDocument | null;
  clipboard: readonly DesignElement[];
}

export interface StudioActions {
  select: (ids: readonly string[]) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setHovered: (id: string | null) => void;

  addElements: (elements: readonly DesignElement[]) => void;
  /** Builds an element and centres it on `at` (default: canvas centre). */
  insert: (build: (id: string) => DesignElement, at?: Point) => void;
  update: (ids: readonly string[], patch: ElementPatch) => void;
  updateSelected: (patch: ElementPatch) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  reorderSelected: (direction: ReorderDirection) => void;
  moveLayer: (id: string, index: number) => void;
  alignSelected: (alignment: Alignment) => void;
  distributeSelected: (axis: DistributeAxis) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  renameElement: (id: string, name: string) => void;
  updateDocument: (patch: DocumentPropsPatch) => void;

  undo: () => void;
  redo: () => void;

  beginGesture: () => void;
  previewGesture: (change: (start: DesignDocument) => DesignDocument) => void;
  endGesture: () => void;
  cancelGesture: () => void;
  setGuides: (guides: readonly Guide[]) => void;

  startTextEdit: (id: string) => void;
  finishTextEdit: (text: string | null) => void;

  setZoom: (zoom: number) => void;
  setFitZoom: (zoom: number) => void;
  zoomBy: (factor: number) => void;
}

export type StudioStore = StoreApi<StudioState & StudioActions>;

export interface StudioDependencies {
  document: DesignDocument;
  createId: () => string;
  onChange: (document: DesignDocument) => void;
  notify: Notify;
  logger: Logger;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 1000) / 1000));
}

export function selectedElements(state: StudioState): DesignElement[] {
  const ids = new Set(state.selection);
  return state.history.present.elements.filter((element) =>
    ids.has(element.id),
  );
}

export function createStudioStore(deps: StudioDependencies): StudioStore {
  return createStore<StudioState & StudioActions>()((set, get) => {
    const documentOf = () => get().history.present;

    /** Applies a change as one undoable step; invalid results are rejected. */
    const commit = (
      change: (document: DesignDocument) => DesignDocument,
      selection?: readonly string[],
    ): boolean => {
      const current = documentOf();
      let next: DesignDocument;
      try {
        next = change(current);
      } catch (error) {
        if (error instanceof DocumentValidationError) {
          deps.logger.warn('studio.change_rejected', { issues: error.issues });
          deps.notify(error.issues[0] ?? 'That change isn’t valid.', 'warning');
          return false;
        }
        throw error;
      }
      if (next === current) {
        if (selection) {
          set({ selection });
        }
        return false;
      }
      set((state) => ({
        history: pushHistory(state.history, next),
        ...(selection ? { selection } : {}),
      }));
      deps.onChange(next);
      return true;
    };

    const editableSelection = (): string[] => {
      const locked = new Set(
        documentOf()
          .elements.filter((element) => element.locked)
          .map((element) => element.id),
      );
      return get().selection.filter((id) => !locked.has(id));
    };

    const keepExisting = (ids: readonly string[], document: DesignDocument) => {
      const existing = new Set(document.elements.map((element) => element.id));
      return ids.filter((id) => existing.has(id));
    };

    const placeCopies = (elements: readonly DesignElement[]) => {
      const copies = elements.map((element) => ({
        ...element,
        id: deps.createId(),
        x: element.x + 24,
        y: element.y + 24,
        locked: false,
      }));
      commit(
        (document) => addElements(document, copies),
        copies.map((copy) => copy.id),
      );
    };

    return {
      history: createHistory(deps.document),
      selection: [],
      hoveredId: null,
      editingTextId: null,
      guides: [],
      zoom: 1,
      fitToScreen: true,
      gestureStart: null,
      clipboard: [],

      select: (ids) => {
        set({ selection: keepExisting(ids, documentOf()) });
      },
      toggleSelection: (id) => {
        const selection = get().selection;
        set({
          selection: selection.includes(id)
            ? selection.filter((item) => item !== id)
            : [...selection, id],
        });
      },
      selectAll: () => {
        set({
          selection: documentOf()
            .elements.filter((element) => !element.hidden)
            .map((element) => element.id),
        });
      },
      clearSelection: () => {
        set({ selection: [], editingTextId: null });
      },
      setHovered: (id) => {
        set({ hoveredId: id });
      },

      addElements: (elements) => {
        commit(
          (document) => addElements(document, elements),
          elements.map((element) => element.id),
        );
      },

      insert: (build, at) => {
        const document = documentOf();
        const element = build(deps.createId());
        const target = at ?? {
          x: document.format.width / 2,
          y: document.format.height / 2,
        };
        // Shrink presets that would overflow small formats.
        const fit = Math.min(
          1,
          (document.format.width * 0.8) / element.width,
          (document.format.height * 0.8) / element.height,
        );
        const width = element.width * fit;
        const height = element.height * fit;
        const scaled =
          element.type === 'text'
            ? { width, fontSize: element.fontSize * fit }
            : element.type === 'line'
              ? { width }
              : { width, height };
        const placed = {
          ...element,
          ...scaled,
          x: Math.round(target.x - width / 2),
          y: Math.round(
            target.y - (element.type === 'line' ? element.height : height) / 2,
          ),
        } as DesignElement;
        get().addElements([placed]);
      },

      update: (ids, patch) => {
        commit((document) => updateElements(document, ids, patch));
      },

      updateSelected: (patch) => {
        commit((document) => updateElements(document, get().selection, patch));
      },

      removeSelected: () => {
        const selection = get().selection;
        const removable = editableSelection();
        const skipped = selection.length - removable.length;
        if (removable.length > 0) {
          commit((document) => removeElements(document, removable), []);
        }
        if (skipped > 0) {
          deps.notify(
            `${skipped} locked layer${skipped === 1 ? ' wasn’t' : 's weren’t'} deleted. Unlock in Layers first.`,
            'warning',
          );
        }
      },

      duplicateSelected: () => {
        const selection = get().selection;
        if (selection.length === 0) {
          return;
        }
        let copies: string[] = [];
        commit((document) => {
          const result = duplicateElements(document, selection, deps.createId);
          copies = result.ids;
          return result.document;
        });
        set({ selection: copies });
      },

      copySelected: () => {
        const elements = selectedElements(get());
        if (elements.length > 0) {
          set({ clipboard: elements });
          deps.notify(
            `Copied ${elements.length} layer${elements.length === 1 ? '' : 's'}.`,
          );
        }
      },

      paste: () => {
        const clipboard = get().clipboard;
        if (clipboard.length > 0) {
          placeCopies(clipboard);
          set({
            clipboard: get().clipboard.map((element) => ({
              ...element,
              x: element.x + 24,
              y: element.y + 24,
            })),
          });
        }
      },

      nudgeSelected: (dx, dy) => {
        const ids = editableSelection();
        commit((document) =>
          updateElements(document, ids, (element) => ({
            x: element.x + dx,
            y: element.y + dy,
          })),
        );
      },

      reorderSelected: (direction) => {
        commit((document) =>
          reorderElements(document, get().selection, direction),
        );
      },

      moveLayer: (id, index) => {
        commit((document) => moveElementTo(document, id, index));
      },

      alignSelected: (alignment) => {
        commit((document) =>
          alignElements(document, editableSelection(), alignment),
        );
      },

      distributeSelected: (axis) => {
        commit((document) =>
          distributeElements(document, editableSelection(), axis),
        );
      },

      toggleHidden: (id) => {
        commit((document) =>
          updateElements(document, [id], (element) => ({
            hidden: !element.hidden,
          })),
        );
      },

      toggleLocked: (id) => {
        commit((document) =>
          updateElements(document, [id], (element) => ({
            locked: !element.locked,
          })),
        );
      },

      renameElement: (id, name) => {
        commit((document) =>
          updateElements(document, [id], { name: name.trim().slice(0, 80) }),
        );
      },

      updateDocument: (patch) => {
        commit((document) => updateDocumentProps(document, patch));
      },

      undo: () => {
        const history = undo(get().history);
        if (history !== get().history) {
          set({
            history,
            selection: keepExisting(get().selection, history.present),
            editingTextId: null,
          });
          deps.onChange(history.present);
        }
      },

      redo: () => {
        const history = redo(get().history);
        if (history !== get().history) {
          set({
            history,
            selection: keepExisting(get().selection, history.present),
          });
          deps.onChange(history.present);
        }
      },

      beginGesture: () => {
        set({ gestureStart: documentOf() });
      },

      previewGesture: (change) => {
        const start = get().gestureStart;
        if (!start) {
          return;
        }
        try {
          set((state) => ({
            history: replacePresent(state.history, change(start)),
          }));
        } catch (error) {
          if (!(error instanceof DocumentValidationError)) {
            throw error;
          }
          // Out-of-range mid-drag positions are skipped, not reported.
        }
      },

      endGesture: () => {
        const start = get().gestureStart;
        const end = documentOf();
        set({ gestureStart: null, guides: [] });
        if (!start || start === end) {
          return;
        }
        set((state) => ({
          history: pushHistory(replacePresent(state.history, start), end),
        }));
        deps.onChange(end);
      },

      cancelGesture: () => {
        const start = get().gestureStart;
        if (start) {
          set((state) => ({
            history: replacePresent(state.history, start),
            gestureStart: null,
            guides: [],
          }));
        }
      },

      setGuides: (guides) => {
        set({ guides });
      },

      startTextEdit: (id) => {
        const element = documentOf().elements.find((item) => item.id === id);
        if (element?.type === 'text' && !element.locked) {
          set({ editingTextId: id, selection: [id] });
        }
      },

      finishTextEdit: (text) => {
        const id = get().editingTextId;
        set({ editingTextId: null });
        if (id !== null && text !== null) {
          commit((document) => updateElements(document, [id], { text }));
        }
      },

      setZoom: (zoom) => {
        set({ zoom: clampZoom(zoom), fitToScreen: false });
      },

      setFitZoom: (zoom) => {
        set({ zoom: clampZoom(zoom), fitToScreen: true });
      },

      zoomBy: (factor) => {
        set((state) => ({
          zoom: clampZoom(state.zoom * factor),
          fitToScreen: false,
        }));
      },
    };
  });
}
