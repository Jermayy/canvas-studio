import StudioRoute from '@/modules/studio/StudioRoute';
import { Studio } from '@/modules/studio/components/Studio';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { NOW, pngFile, rect, text, withElements } from '@/test/factories';
import { createTestServices, renderWithWorkspace } from '@/test/testServices';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup(
  document: DesignDocument = withElements(
    rect({ id: 'card', x: 100, y: 100, width: 200, height: 100, name: 'Card' }),
    text({ id: 'title', x: 100, y: 400, width: 400, text: 'Gala night' }),
  ),
) {
  const { services, files } = createTestServices();
  const workspace = services.openWorkspace({
    session: {
      userId: 'u',
      email: 'e',
      displayName: 'd',
      provider: 'local',
      expiresAt: NOW + 1,
    },
    dataKey: {} as CryptoKey,
  });
  void workspace.store.getState().createDocument(document);
  const result = renderWithWorkspace(
    <Studio initialDocument={document} mode="account" />,
    { services, workspace },
  );
  const current = () => workspace.store.getState().documents[document.id];
  const toasts = () =>
    services.toasts.getState().toasts.map((toast) => toast.message);
  return { ...result, user: userEvent.setup(), files, current, toasts };
}

const canvas = () => screen.getByRole('application');
const layer = (id: string) => {
  const node = canvas().querySelector(`[data-element-id="${id}"] rect`);
  if (!node) {
    throw new Error(`no element ${id}`);
  }
  return node;
};
const openLayers = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: /Layers/ }));
};

describe('Studio', () => {
  it('shows the page settings, top bar and status when nothing is selected', () => {
    setup();
    expect(screen.getByLabelText('Design name')).toHaveValue('Test design');
    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(screen.getByText('2 layers')).toBeInTheDocument();
    expect(screen.getByText('1000 × 1000 px · 100%')).toBeInTheDocument();
  });

  it('adds elements from every insert tab and saves them', async () => {
    const { user, current } = setup();
    await user.click(screen.getByRole('button', { name: 'Add heading' }));
    await user.click(screen.getByRole('button', { name: /Shapes/ }));
    await user.click(screen.getByRole('button', { name: 'Add star' }));
    await user.click(screen.getByRole('button', { name: 'Add arrow' }));
    await user.click(screen.getByRole('button', { name: /Icons/ }));
    await user.type(screen.getByLabelText('Search icons'), 'cake');
    await user.click(screen.getByRole('button', { name: 'Add cake' }));
    await user.clear(screen.getByLabelText('Search icons'));
    await user.type(screen.getByLabelText('Search icons'), 'zzzz');
    expect(screen.getByText('No icons found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Backdrop/ }));
    await user.click(screen.getByRole('button', { name: 'Sunset background' }));
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(6);
    });
    expect(current()?.background).toMatchObject({
      kind: 'linear',
      from: '#f97316',
    });
  });

  it('uploads images, rejects non-images and places them', async () => {
    const { user, current, toasts } = setup(withElements());
    await user.click(screen.getByRole('button', { name: /Uploads/ }));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error('no file input');
    }
    await user.upload(input, [
      pngFile('logo.png'),
      new File(['nope'], 'notes.png', { type: 'image/png' }),
    ]);
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(1);
    });
    expect(toasts()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/notes.png isn’t a PNG/),
        'Added 1 image to the canvas.',
      ]),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Add logo.png' }),
    );
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(2);
    });
  });

  it('selects on the canvas, edits in the inspector and undoes', async () => {
    const { user, current } = setup();
    fireEvent.pointerDown(layer('card'), {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 1,
    });
    fireEvent.pointerUp(layer('card'), {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 1,
    });
    expect(screen.getByText('Card')).toBeInTheDocument();
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '250{Enter}');
    await waitFor(() => {
      expect(current()?.elements[0]?.x).toBe(250);
    });
    await user.click(screen.getByRole('radio', { name: 'Gradient' }));
    await user.click(screen.getByRole('switch', { name: 'Outline' }));
    await user.click(screen.getByRole('switch', { name: 'Drop shadow' }));
    await user.click(
      screen.getByRole('button', { name: 'Align centre to page' }),
    );
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(current()?.elements[0]).toMatchObject({
        x: 250,
        shadow: expect.any(Object),
      });
    });
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  it('drags with snapping as a single undo step, and box-selects', async () => {
    const { user, current } = setup();
    const viewport = canvas();
    fireEvent.pointerDown(layer('card'), {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 1,
    });
    fireEvent.pointerMove(viewport, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
    });
    fireEvent.pointerMove(viewport, {
      clientX: 448,
      clientY: 250,
      pointerId: 1,
    });
    fireEvent.pointerUp(viewport, { clientX: 448, clientY: 250, pointerId: 1 });
    await waitFor(() => {
      // Snapped so the card's centre lands on the page centre (500).
      expect(current()?.elements[0]).toMatchObject({ x: 400, y: 200 });
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(current()?.elements[0]).toMatchObject({ x: 100, y: 100 });
    });

    fireEvent.pointerDown(viewport, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    });
    fireEvent.pointerMove(viewport, {
      clientX: 900,
      clientY: 900,
      pointerId: 2,
    });
    expect(viewport.querySelector('.selection__marquee')).not.toBeNull();
    fireEvent.pointerUp(viewport, { clientX: 900, clientY: 900, pointerId: 2 });
    expect(document.querySelector('.status-bar__summary')).toHaveTextContent(
      '2 layers selected',
    );
  });

  it('resizes and rotates with the handles', async () => {
    const { current } = setup();
    fireEvent.pointerDown(layer('card'), {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas(), { clientX: 150, clientY: 150, pointerId: 1 });
    const handle = (name: string) => {
      const node = canvas().querySelector(`[data-handle="${name}"]`);
      if (!node) {
        throw new Error(`no handle ${name}`);
      }
      return node;
    };
    fireEvent.pointerDown(handle('se'), {
      button: 0,
      clientX: 300,
      clientY: 200,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas(), {
      clientX: 400,
      clientY: 300,
      pointerId: 1,
    });
    fireEvent.pointerUp(canvas(), { clientX: 400, clientY: 300, pointerId: 1 });
    await waitFor(() => {
      expect(current()?.elements[0]).toMatchObject({ width: 300, height: 200 });
    });
    fireEvent.pointerDown(handle('rotate'), {
      button: 0,
      clientX: 250,
      clientY: 70,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas(), {
      clientX: 500,
      clientY: 200,
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(canvas(), { clientX: 500, clientY: 200, pointerId: 1 });
    await waitFor(() => {
      expect(current()?.elements[0]?.rotation).toBe(90);
    });
  });

  it('edits text in place with a double-click', async () => {
    const { user, current } = setup();
    fireEvent.doubleClick(layer('title'));
    const editor = screen.getByLabelText('Edit text');
    await user.clear(editor);
    await user.type(editor, 'Awards night{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(current()?.elements[1]).toMatchObject({ text: 'Awards night' });
    });
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });

  it('handles keyboard shortcuts', async () => {
    const { user, current } = setup();
    await user.keyboard('{Meta>}a{/Meta}');
    expect(document.querySelector('.status-bar__summary')).toHaveTextContent(
      '2 layers selected',
    );
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await waitFor(() => {
      expect(current()?.elements[0]?.x).toBe(110);
    });
    await user.keyboard('{Meta>}d{/Meta}');
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(4);
    });
    await user.keyboard('{Backspace}');
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(2);
    });
    await user.keyboard('{Meta>}z{/Meta}');
    await waitFor(() => {
      expect(current()?.elements).toHaveLength(4);
    });
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    await user.keyboard('{Escape}');
    await user.keyboard('s');
    expect(
      screen.getByRole('heading', { name: 'Shapes & lines' }),
    ).toBeInTheDocument();
    await user.keyboard('{Meta>}={/Meta}');
    expect(
      screen.getByRole('button', { name: 'Zoom level' }),
    ).toHaveTextContent('125%');
    await user.keyboard('?');
    expect(
      screen.getByRole('heading', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
  });

  it('manages layers: select, hide, lock, rename and reorder', async () => {
    const { user, current } = setup();
    await openLayers(user);
    const rows = screen.getAllByRole('button', {
      name: /Front-most layer|Back-most layer/,
    });
    expect(rows[0]).toHaveAccessibleName(
      /“Gala night”, Text, Front-most layer/,
    );
    await user.click(screen.getByRole('button', { name: 'Hide Card' }));
    await user.click(screen.getByRole('button', { name: 'Lock Card' }));
    await waitFor(() => {
      expect(current()?.elements[0]).toMatchObject({
        hidden: true,
        locked: true,
      });
    });
    expect(
      screen.getByText('Hidden — not shown or exported'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rename Card' }));
    const name = screen.getByLabelText('Layer name');
    await user.clear(name);
    await user.type(name, 'Hero card{Enter}');
    await waitFor(() => {
      expect(current()?.elements[0]?.name).toBe('Hero card');
    });
    const top = screen.getByRole('button', { name: /^“Gala night”, Text/ });
    await user.click(top);
    fireEvent.keyDown(top, { key: 'ArrowDown', altKey: true });
    await waitFor(() => {
      expect(current()?.elements[0]?.id).toBe('title');
    });
  });

  it('runs commands from the palette', async () => {
    const { user, current } = setup();
    await user.keyboard('{Meta>}k{/Meta}');
    const input = screen.getByRole('combobox', { name: 'Search commands' });
    await user.type(input, 'add circle');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(current()?.elements.at(-1)).toMatchObject({ shape: 'ellipse' });
    });
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(
      screen.getByRole('combobox', { name: 'Search commands' }),
      'nothing like this',
    );
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('exports with a custom file name and validates it', async () => {
    const { user, files, toasts } = setup();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    const fileName = within(dialog).getByLabelText('File name');
    await user.clear(fileName);
    await user.type(fileName, 'bad/name');
    expect(within(dialog).getByText(/can’t contain/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Download PNG/ }),
    ).toBeDisabled();
    await user.clear(fileName);
    await user.type(fileName, 'Gala poster');
    await user.click(within(dialog).getByRole('radio', { name: /JPEG/ }));
    expect(within(dialog).getByText('Quality')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: /SVG/ }));
    expect(
      within(dialog).getByText(/Vector: text, shapes/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: /PDF/ }));
    await user.click(within(dialog).getByRole('radio', { name: '3×' }));
    expect(within(dialog).getByText(/3,000 × 3,000 px/)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: /Download PDF/ }),
    );
    await waitFor(() => {
      expect(files.downloads.map((download) => download.fileName)).toEqual([
        'Gala poster.pdf',
      ]);
    });
    expect(toasts()).toContain('Downloaded Gala poster.pdf.');
  });

  it('shares natively, copies the image and drafts an email', async () => {
    const { user, files, toasts } = setup();
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: 'Share' }));
    const dialog = screen.getByRole('dialog', { name: 'Share' });
    await user.click(within(dialog).getByRole('button', { name: 'Share…' }));
    await waitFor(() => {
      expect(files.share).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: 'Share' }));
    const again = screen.getByRole('dialog', { name: 'Share' });
    await user.click(within(again).getByRole('button', { name: 'Copy PNG' }));
    await waitFor(() => {
      expect(files.copyImage).toHaveBeenCalled();
    });
    await user.type(within(again).getByLabelText('To'), 'not-an-email');
    await user.click(
      within(again).getByRole('button', { name: /open email draft/ }),
    );
    expect(
      within(again).getByText('“not-an-email” isn’t a valid email address.'),
    ).toBeInTheDocument();
    await user.clear(within(again).getByLabelText('To'));
    await user.type(within(again).getByLabelText('To'), 'team@example.test');
    await user.click(
      within(again).getByRole('button', { name: /open email draft/ }),
    );
    await waitFor(() => {
      expect(files.openEmailDraft).toHaveBeenCalledWith(
        expect.stringMatching(/^mailto:team%40example.test\?subject=/),
      );
    });
    expect(files.downloads.at(-1)?.fileName).toBe('Test design.png');
    expect(
      toasts().some((message) =>
        message.includes('Attach it to the email draft'),
      ),
    ).toBe(true);
    Reflect.deleteProperty(navigator, 'share');
  });

  it('falls back to downloading when the browser can’t share that file', async () => {
    const { user, files } = setup();
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      configurable: true,
    });
    vi.mocked(files.canShareFiles).mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Share' })).getByRole(
        'button',
        { name: 'Share…' },
      ),
    );
    await waitFor(() => {
      expect(files.downloads).toHaveLength(1);
    });
    Reflect.deleteProperty(navigator, 'share');
  });

  it('renames the design and edits the page size from the inspector', async () => {
    const { user, current } = setup();
    const name = screen.getByLabelText('Design name');
    await user.clear(name);
    await user.type(name, 'Spring gala{Enter}');
    await user.selectOptions(screen.getByLabelText('Format'), 'story');
    await user.selectOptions(screen.getByLabelText('Template type'), 'wedding');
    await waitFor(() => {
      expect(current()).toMatchObject({
        name: 'Spring gala',
        category: 'wedding',
        format: { width: 1080, height: 1920 },
      });
    });
    await user.click(screen.getByRole('radio', { name: 'None' }));
    expect(screen.getByText(/Transparent: PNG and SVG/)).toBeInTheDocument();
  });

  it('shows type-specific inspector sections', async () => {
    const { user, current } = setup();
    await openLayers(user);
    await user.click(
      screen.getByRole('button', { name: /^“Gala night”, Text/ }),
    );
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.selectOptions(screen.getByLabelText('Font'), 'didot');
    await user.click(screen.getByRole('button', { name: 'Italic' }));
    await user.click(screen.getByRole('radio', { name: 'Centre' }));
    const content = screen.getByLabelText('Content');
    await user.clear(content);
    await user.type(content, 'New copy');
    await user.tab();
    await waitFor(() => {
      expect(current()?.elements[1]).toMatchObject({
        fontFamily: 'didot',
        italic: true,
        align: 'center',
        text: 'New copy',
      });
    });
    expect(screen.getByLabelText('H')).toBeDisabled();
  });

  it('opens settings from the menu and saves on demand', async () => {
    const { user, toasts } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitem', { name: /Appearance/ }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('switch', { name: 'Snap to guides' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.keyboard('{Meta>}s{/Meta}');
    await waitFor(() => {
      expect(toasts()).toContain('All changes saved.');
    });
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe('studio route', () => {
  it('offers changes from another device instead of forcing them on the editor', async () => {
    const document = withElements(rect({ id: 'card' }));
    const { services } = createTestServices();
    const workspace = services.openSandbox();
    await workspace.store.getState().load();
    await workspace.store.getState().createDocument(document);
    renderWithWorkspace(<StudioRoute documentId={document.id} />, {
      services,
      workspace,
    });
    expect(await screen.findByLabelText('Design name')).toHaveValue(
      document.name,
    );

    await act(() =>
      workspace.store
        .getState()
        .applyRemoteDocument({ ...document, name: 'Edited elsewhere' }),
    );
    expect(screen.getByLabelText('Design name')).toHaveValue(document.name);
    expect(screen.getByText(/changed on another device/)).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Load latest' }));
    expect(screen.getByLabelText('Design name')).toHaveValue(
      'Edited elsewhere',
    );
    expect(screen.queryByText(/changed on another device/)).toBeNull();

    await act(() =>
      workspace.store.getState().removeRemoteDocument(document.id),
    );
    expect(screen.getByText(/deleted on another device/)).toBeInTheDocument();
  });
});
