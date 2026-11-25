import { findPreset } from '@/modules/library/presets';
import { MOD } from '@/modules/studio/keyboard';
import type { StudioStore } from '@/modules/studio/state/studioStore';
import type { InsertTab, StudioDialog } from '@/modules/studio/studioContext';

/**
 * Every studio action as a named command, shared by the command palette
 * and the shortcuts reference so they can't drift apart.
 */

export interface Command {
  id: string;
  label: string;
  group: 'Insert' | 'Edit' | 'Arrange' | 'View' | 'File';
  shortcut?: string;
  keywords?: string;
  enabled: boolean;
  run: () => void;
}

export function buildCommands(
  store: StudioStore,
  ui: {
    openDialog: (dialog: StudioDialog) => void;
    openInsertTab: (tab: InsertTab) => void;
  },
): Command[] {
  const state = store.getState();
  const hasSelection = state.selection.length > 0;
  const insert = (presetId: string) => () => {
    const preset = findPreset(presetId);
    if (preset) {
      store.getState().insert(preset.build);
    }
  };
  return [
    {
      id: 'add-heading',
      label: 'Add heading',
      group: 'Insert',
      keywords: 'text title',
      enabled: true,
      run: insert('text-heading'),
    },
    {
      id: 'add-body',
      label: 'Add body text',
      group: 'Insert',
      keywords: 'paragraph',
      enabled: true,
      run: insert('text-body'),
    },
    {
      id: 'add-rectangle',
      label: 'Add rectangle',
      group: 'Insert',
      keywords: 'shape box',
      enabled: true,
      run: insert('shape-rectangle'),
    },
    {
      id: 'add-circle',
      label: 'Add circle',
      group: 'Insert',
      keywords: 'shape ellipse',
      enabled: true,
      run: insert('shape-ellipse'),
    },
    {
      id: 'add-star',
      label: 'Add star',
      group: 'Insert',
      keywords: 'shape',
      enabled: true,
      run: insert('shape-star'),
    },
    {
      id: 'add-arrow',
      label: 'Add arrow',
      group: 'Insert',
      keywords: 'line',
      enabled: true,
      run: insert('line-arrow'),
    },
    {
      id: 'browse-icons',
      label: 'Browse icons…',
      group: 'Insert',
      enabled: true,
      run: () => {
        ui.openInsertTab('icons');
      },
    },
    {
      id: 'upload-image',
      label: 'Upload images…',
      group: 'Insert',
      keywords: 'photo picture',
      enabled: true,
      run: () => {
        ui.openInsertTab('uploads');
      },
    },
    {
      id: 'undo',
      label: 'Undo',
      group: 'Edit',
      shortcut: `${MOD}Z`,
      enabled: state.history.past.length > 0,
      run: state.undo,
    },
    {
      id: 'redo',
      label: 'Redo',
      group: 'Edit',
      shortcut: `${MOD}⇧Z`,
      enabled: state.history.future.length > 0,
      run: state.redo,
    },
    {
      id: 'duplicate',
      label: 'Duplicate selection',
      group: 'Edit',
      shortcut: `${MOD}D`,
      enabled: hasSelection,
      run: state.duplicateSelected,
    },
    {
      id: 'copy',
      label: 'Copy selection',
      group: 'Edit',
      shortcut: `${MOD}C`,
      enabled: hasSelection,
      run: state.copySelected,
    },
    {
      id: 'paste',
      label: 'Paste',
      group: 'Edit',
      shortcut: `${MOD}V`,
      enabled: state.clipboard.length > 0,
      run: state.paste,
    },
    {
      id: 'delete',
      label: 'Delete selection',
      group: 'Edit',
      shortcut: '⌫',
      enabled: hasSelection,
      run: state.removeSelected,
    },
    {
      id: 'select-all',
      label: 'Select all',
      group: 'Edit',
      shortcut: `${MOD}A`,
      enabled: true,
      run: state.selectAll,
    },
    {
      id: 'front',
      label: 'Bring to front',
      group: 'Arrange',
      shortcut: '⇧]',
      enabled: hasSelection,
      run: () => {
        state.reorderSelected('front');
      },
    },
    {
      id: 'forward',
      label: 'Bring forward',
      group: 'Arrange',
      shortcut: ']',
      enabled: hasSelection,
      run: () => {
        state.reorderSelected('forward');
      },
    },
    {
      id: 'backward',
      label: 'Send backward',
      group: 'Arrange',
      shortcut: '[',
      enabled: hasSelection,
      run: () => {
        state.reorderSelected('backward');
      },
    },
    {
      id: 'back',
      label: 'Send to back',
      group: 'Arrange',
      shortcut: '⇧[',
      enabled: hasSelection,
      run: () => {
        state.reorderSelected('back');
      },
    },
    {
      id: 'align-center',
      label: 'Centre horizontally',
      group: 'Arrange',
      enabled: hasSelection,
      run: () => {
        state.alignSelected('center');
      },
    },
    {
      id: 'align-middle',
      label: 'Centre vertically',
      group: 'Arrange',
      enabled: hasSelection,
      run: () => {
        state.alignSelected('middle');
      },
    },
    {
      id: 'zoom-in',
      label: 'Zoom in',
      group: 'View',
      shortcut: `${MOD}+`,
      enabled: true,
      run: () => {
        state.zoomBy(1.25);
      },
    },
    {
      id: 'zoom-out',
      label: 'Zoom out',
      group: 'View',
      shortcut: `${MOD}−`,
      enabled: true,
      run: () => {
        state.zoomBy(0.8);
      },
    },
    {
      id: 'zoom-fit',
      label: 'Fit to screen',
      group: 'View',
      shortcut: '⇧1',
      enabled: true,
      run: () => {
        store.setState({ fitToScreen: true });
      },
    },
    {
      id: 'zoom-100',
      label: 'Actual size (100%)',
      group: 'View',
      shortcut: '⇧0',
      enabled: true,
      run: () => {
        state.setZoom(1);
      },
    },
    {
      id: 'settings',
      label: 'Appearance & editor settings',
      group: 'View',
      keywords: 'theme dark accent',
      enabled: true,
      run: () => {
        ui.openDialog('settings');
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      group: 'View',
      shortcut: '?',
      enabled: true,
      run: () => {
        ui.openDialog('shortcuts');
      },
    },
    {
      id: 'export',
      label: 'Export / download…',
      group: 'File',
      shortcut: `${MOD}E`,
      keywords: 'pdf png jpeg svg',
      enabled: true,
      run: () => {
        ui.openDialog('export');
      },
    },
    {
      id: 'share',
      label: 'Share or email…',
      group: 'File',
      keywords: 'send',
      enabled: true,
      run: () => {
        ui.openDialog('share');
      },
    },
  ];
}

export function filterCommands(
  commands: readonly Command[],
  term: string,
): Command[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const haystack =
      `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
