import {
  findElement,
  updateElements,
} from '@/modules/document/domain/operations';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { buildCommands, filterCommands } from '@/modules/studio/commands';
import {
  clampZoom,
  createStudioStore,
  MAX_ZOOM,
  MIN_ZOOM,
  selectedElements,
} from '@/modules/studio/state/studioStore';
import { createLogger } from '@/shared/logger';
import { rect, text, withElements } from '@/test/factories';

function setup(
  document: DesignDocument = withElements(
    rect({ id: 'a' }),
    rect({ id: 'b', x: 200 }),
  ),
) {
  const changes: DesignDocument[] = [];
  const notify = vi.fn();
  let counter = 0;
  const store = createStudioStore({
    document,
    createId: () => `new-${(counter += 1)}`,
    onChange: (next) => changes.push(next),
    notify,
    logger: createLogger({ service: 'test', sink: () => undefined }),
  });
  const doc = () => store.getState().history.present;
  return { store, changes, notify, doc };
}

describe('studio store', () => {
  it('selects, toggles and clears, ignoring unknown ids', () => {
    const { store } = setup();
    store.getState().select(['a', 'ghost']);
    expect(store.getState().selection).toEqual(['a']);
    store.getState().toggleSelection('b');
    store.getState().toggleSelection('a');
    expect(store.getState().selection).toEqual(['b']);
    store.getState().selectAll();
    expect(
      selectedElements(store.getState()).map((element) => element.id),
    ).toEqual(['a', 'b']);
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
    store.getState().setHovered('a');
    expect(store.getState().hoveredId).toBe('a');
  });

  it('records each change as an undo step and saves it', () => {
    const { store, changes, doc } = setup();
    store.getState().update(['a'], { x: 50 });
    expect(findElement(doc(), 'a')?.x).toBe(50);
    expect(changes).toHaveLength(1);
    store.getState().undo();
    expect(findElement(doc(), 'a')?.x).toBe(0);
    store.getState().redo();
    expect(findElement(doc(), 'a')?.x).toBe(50);
    expect(changes).toHaveLength(3);
    store.getState().redo();
    expect(changes).toHaveLength(3);
  });

  it('rejects invalid changes with a message instead of crashing', () => {
    const { store, notify, changes } = setup();
    store.getState().update(['a'], { opacity: 5 });
    expect(changes).toHaveLength(0);
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/opacity/),
      'warning',
    );
  });

  it('inserts presets centred, scaled to fit small canvases, and selects them', () => {
    const { store, doc } = setup(withElements());
    store.getState().insert((id) => rect({ id, width: 200, height: 100 }));
    const added = doc().elements[0];
    expect(added).toMatchObject({ x: 400, y: 450 });
    expect(store.getState().selection).toEqual([added?.id]);

    store.getState().insert((id) => rect({ id, width: 4000, height: 1000 }), {
      x: 100,
      y: 100,
    });
    expect(doc().elements[1]?.width).toBeCloseTo(800);
    store.getState().insert((id) => text({ id, width: 2000, fontSize: 100 }));
    const scaledText = doc().elements[2];
    expect(scaledText?.type === 'text' ? scaledText.fontSize : 0).toBeCloseTo(
      40,
    );
  });

  it('keeps locked layers when deleting and explains why', () => {
    const { store, notify, doc } = setup();
    store.getState().toggleLocked('a');
    store.getState().selectAll();
    store.getState().removeSelected();
    expect(doc().elements.map((element) => element.id)).toEqual(['a']);
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/1 locked layer wasn’t deleted/),
      'warning',
    );
  });

  it('duplicates, copies and pastes with fresh ids', () => {
    const { store, doc, notify } = setup();
    store.getState().duplicateSelected();
    expect(doc().elements).toHaveLength(2);
    store.getState().select(['a']);
    store.getState().duplicateSelected();
    expect(store.getState().selection).toEqual(['new-1']);
    store.getState().copySelected();
    expect(notify).toHaveBeenCalledWith('Copied 1 layer.');
    store.getState().paste();
    store.getState().paste();
    expect(doc().elements.map((element) => element.id)).toEqual([
      'a',
      'b',
      'new-1',
      'new-2',
      'new-3',
    ]);
    expect(findElement(doc(), 'new-3')?.x).toBe(
      (findElement(doc(), 'new-2')?.x ?? 0) + 24,
    );
  });

  it('nudges, reorders, aligns and distributes the selection', () => {
    const { store, doc } = setup(
      withElements(
        rect({ id: 'a' }),
        rect({ id: 'b', x: 150 }),
        rect({ id: 'c', x: 600 }),
      ),
    );
    store.getState().select(['a']);
    store.getState().nudgeSelected(5, -2);
    expect(findElement(doc(), 'a')).toMatchObject({ x: 5, y: -2 });
    store.getState().reorderSelected('front');
    expect(doc().elements.at(-1)?.id).toBe('a');
    store.getState().moveLayer('a', 0);
    expect(doc().elements[0]?.id).toBe('a');
    store.getState().selectAll();
    store.getState().alignSelected('top');
    expect(doc().elements.every((element) => element.y === -2)).toBe(true);
    store.getState().distributeSelected('horizontal');
    expect(findElement(doc(), 'b')?.x).toBeCloseTo(302.5);
  });

  it('hides, locks, renames and updates the page', () => {
    const { store, doc } = setup();
    store.getState().toggleHidden('a');
    store.getState().renameElement('a', '  Hero  ');
    store.getState().updateDocument({ name: 'Renamed' });
    store.getState().select(['b']);
    store.getState().updateSelected({ opacity: 0.5 });
    expect(findElement(doc(), 'a')).toMatchObject({
      hidden: true,
      name: 'Hero',
    });
    expect(findElement(doc(), 'b')?.opacity).toBe(0.5);
    expect(doc().name).toBe('Renamed');
  });

  it('turns a whole drag into one undo step and one save', () => {
    const { store, changes, doc } = setup();
    store.getState().beginGesture();
    store
      .getState()
      .previewGesture((start) => updateElements(start, ['a'], { x: 10 }));
    store
      .getState()
      .previewGesture((start) => updateElements(start, ['a'], { x: 20 }));
    store
      .getState()
      .previewGesture((start) => updateElements(start, ['a'], { width: -1 }));
    store.getState().setGuides([{ axis: 'x', position: 20 }]);
    expect(changes).toHaveLength(0);
    store.getState().endGesture();
    expect(findElement(doc(), 'a')?.x).toBe(20);
    expect(store.getState().guides).toEqual([]);
    expect(changes).toHaveLength(1);
    store.getState().undo();
    expect(findElement(doc(), 'a')?.x).toBe(0);
  });

  it('cancels a gesture back to where it started', () => {
    const { store, doc, changes } = setup();
    store
      .getState()
      .previewGesture((start) => updateElements(start, ['a'], { x: 99 }));
    store.getState().beginGesture();
    store
      .getState()
      .previewGesture((start) => updateElements(start, ['a'], { x: 99 }));
    store.getState().cancelGesture();
    expect(findElement(doc(), 'a')?.x).toBe(0);
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(changes).toHaveLength(0);
  });

  it('edits text in place, only for unlocked text', () => {
    const { store, doc } = setup(
      withElements(text({ id: 't' }), rect({ id: 'r' })),
    );
    store.getState().startTextEdit('r');
    expect(store.getState().editingTextId).toBeNull();
    store.getState().startTextEdit('t');
    expect(store.getState().selection).toEqual(['t']);
    store.getState().finishTextEdit(null);
    expect(store.getState().editingTextId).toBeNull();
    store.getState().startTextEdit('t');
    store.getState().finishTextEdit('Updated');
    const element = findElement(doc(), 't');
    expect(element?.type === 'text' ? element.text : '').toBe('Updated');
  });

  it('clamps zoom and tracks fit mode', () => {
    const { store } = setup();
    store.getState().setZoom(100);
    expect(store.getState()).toMatchObject({
      zoom: MAX_ZOOM,
      fitToScreen: false,
    });
    store.getState().setFitZoom(0.5);
    expect(store.getState()).toMatchObject({ zoom: 0.5, fitToScreen: true });
    store.getState().zoomBy(0.0001);
    expect(store.getState().zoom).toBe(MIN_ZOOM);
    expect(clampZoom(1.23456)).toBe(1.235);
  });
});

describe('commands', () => {
  it('builds runnable commands that reflect the current state', () => {
    const { store, doc } = setup();
    const ui = { openDialog: vi.fn(), openInsertTab: vi.fn() };
    const commands = buildCommands(store, ui);
    expect(commands.find((command) => command.id === 'undo')?.enabled).toBe(
      false,
    );
    expect(
      commands.find((command) => command.id === 'duplicate')?.enabled,
    ).toBe(false);
    commands.find((command) => command.id === 'add-star')?.run();
    expect(doc().elements.at(-1)).toMatchObject({
      type: 'shape',
      shape: 'star',
    });
    commands.find((command) => command.id === 'export')?.run();
    expect(ui.openDialog).toHaveBeenCalledWith('export');
    commands.find((command) => command.id === 'browse-icons')?.run();
    expect(ui.openInsertTab).toHaveBeenCalledWith('icons');
    for (const command of buildCommands(store, ui)) {
      command.run();
    }
    expect(store.getState().zoom).toBe(1);
  });

  it('filters by every word across label, group and keywords', () => {
    const { store } = setup();
    const commands = buildCommands(store, {
      openDialog: vi.fn(),
      openInsertTab: vi.fn(),
    });
    expect(
      filterCommands(commands, 'pdf').map((command) => command.id),
    ).toEqual(['export']);
    expect(
      filterCommands(commands, 'insert shape box').map((command) => command.id),
    ).toEqual(['add-rectangle']);
    expect(filterCommands(commands, '')).toHaveLength(commands.length);
  });
});
