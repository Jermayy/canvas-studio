import { isTypingTarget } from '@/modules/studio/keyboard';
import type { StudioStore } from '@/modules/studio/state/studioStore';
import type { InsertTab, StudioDialog } from '@/modules/studio/studioContext';
import { useEffect, useEffectEvent } from 'react';

const INSERT_KEYS: Record<string, InsertTab> = {
  t: 'text',
  s: 'shapes',
  i: 'icons',
  u: 'uploads',
  b: 'background',
};

/** Studio keyboard shortcuts. Inactive while typing or while a dialog is open. */
export function useStudioShortcuts(options: {
  store: StudioStore;
  dialogOpen: boolean;
  openDialog: (dialog: StudioDialog) => void;
  openInsertTab: (tab: InsertTab) => void;
  onSave: () => void;
}) {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    const { store, dialogOpen } = options;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      options.openDialog('commands');
      return;
    }
    if (dialogOpen || isTypingTarget(event.target)) {
      return;
    }
    const state = store.getState();
    if (state.editingTextId) {
      return;
    }
    const key = event.key.toLowerCase();
    const handled = () => {
      event.preventDefault();
    };

    if (mod) {
      switch (key) {
        case 'z':
          handled();
          if (event.shiftKey) {
            state.redo();
          } else {
            state.undo();
          }
          return;
        case 'y':
          handled();
          state.redo();
          return;
        case 'd':
          handled();
          state.duplicateSelected();
          return;
        case 'c':
          if (state.selection.length > 0) {
            handled();
            state.copySelected();
          }
          return;
        case 'v':
          if (state.clipboard.length > 0) {
            handled();
            state.paste();
          }
          return;
        case 'a':
          handled();
          state.selectAll();
          return;
        case 's':
          handled();
          options.onSave();
          return;
        case 'e':
          handled();
          options.openDialog('export');
          return;
        case '=':
        case '+':
          handled();
          state.zoomBy(1.25);
          return;
        case '-':
          handled();
          state.zoomBy(0.8);
          return;
        default:
          return;
      }
    }

    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        handled();
        state.removeSelected();
        return;
      case 'Escape':
        state.clearSelection();
        return;
      case 'ArrowLeft':
        handled();
        state.nudgeSelected(-step, 0);
        return;
      case 'ArrowRight':
        handled();
        state.nudgeSelected(step, 0);
        return;
      case 'ArrowUp':
        handled();
        state.nudgeSelected(0, -step);
        return;
      case 'ArrowDown':
        handled();
        state.nudgeSelected(0, step);
        return;
      case ']':
      case '}':
        handled();
        state.reorderSelected(event.shiftKey ? 'front' : 'forward');
        return;
      case '[':
      case '{':
        handled();
        state.reorderSelected(event.shiftKey ? 'back' : 'backward');
        return;
      case 'Enter': {
        const [id] = state.selection;
        if (id && state.selection.length === 1) {
          handled();
          state.startTextEdit(id);
        }
        return;
      }
      case '?':
        handled();
        options.openDialog('shortcuts');
        return;
      case '!':
        handled();
        store.setState({ fitToScreen: true });
        return;
      case ')':
        handled();
        state.setZoom(1);
        return;
      default:
        break;
    }
    const tab = INSERT_KEYS[key];
    if (tab && !event.shiftKey && !event.altKey) {
      handled();
      options.openInsertTab(tab);
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
    };
  }, []);
}
