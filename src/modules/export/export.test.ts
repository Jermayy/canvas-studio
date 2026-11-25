import { createImage } from '@/modules/document/domain/elementFactory';
import {
  exportDesign,
  ExportError,
  type ExportDependencies,
} from '@/modules/export/application/exportDesign';
import {
  checkExportOptions,
  defaultExportOptions,
  effectiveDpi,
  exportFormat,
  maxScale,
  outputSize,
  type ExportOptions,
} from '@/modules/export/domain/exportOptions';
import {
  browserDeliveryEnvironment,
  createFileDelivery,
  type DeliveryEnvironment,
} from '@/modules/export/infrastructure/fileDelivery';
import { svgRenderer } from '@/modules/render/svgMarkup';
import {
  buildMailto,
  MAX_MAILTO_LENGTH,
  MAX_RECIPIENTS,
  parseRecipients,
} from '@/modules/share/emailDraft';
import { makeDocument, rect, withElements } from '@/test/factories';

const options = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
  format: 'png',
  fileName: 'Poster',
  scale: 2,
  quality: 0.9,
  transparent: false,
  ...overrides,
});

describe('export options', () => {
  const document = makeDocument();

  it('computes output size and print resolution', () => {
    expect(outputSize(document, options({ scale: 3 }))).toEqual({
      width: 3000,
      height: 3000,
    });
    expect(outputSize(document, options({ format: 'svg', scale: 4 }))).toEqual({
      width: 1000,
      height: 1000,
    });
    expect(effectiveDpi(3)).toBe(288);
    expect(exportFormat('jpeg').extension).toBe('jpg');
  });

  it('caps the scale to what every browser can draw', () => {
    expect(maxScale(document)).toBe(4);
    expect(
      maxScale(
        makeDocument({ format: { id: 'x', width: 4000, height: 4000 } }),
      ),
    ).toBe(1);
    expect(
      maxScale(
        makeDocument({ format: { id: 'x', width: 8000, height: 8000 } }),
      ),
    ).toBe(1);
    const big = makeDocument({
      format: { id: 'slide', width: 1920, height: 1080 },
    });
    expect(checkExportOptions(big, options({ scale: 3 }))).toMatchObject({
      ok: false,
      errors: { scale: expect.any(String) },
    });
    expect(
      checkExportOptions(big, options({ format: 'svg', scale: 4 })),
    ).toMatchObject({ ok: true });
  });

  it('validates the file name and adds the extension', () => {
    expect(
      checkExportOptions(document, options({ fileName: 'Gala night' })),
    ).toEqual({ ok: true, fileName: 'Gala night.png' });
    expect(
      checkExportOptions(document, options({ fileName: 'a/b' })),
    ).toMatchObject({ ok: false });
    expect(defaultExportOptions(document, 'Gala')).toMatchObject({
      format: 'png',
      scale: 2,
      fileName: 'Gala',
    });
  });
});

describe('exportDesign', () => {
  const png = new Blob(['png'], { type: 'image/png' });

  function deps(overrides: Partial<ExportDependencies> = {}) {
    const phases: string[] = [];
    const value: ExportDependencies = {
      loadAsset: vi.fn((id: string) =>
        Promise.resolve(id === 'present' ? new Blob(['img']) : null),
      ),
      toDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')),
      renderer: { render: vi.fn(() => Promise.resolve('<svg/>')) },
      rasterizer: { rasterize: vi.fn(() => Promise.resolve(png)) },
      pdf: {
        write: vi.fn(() =>
          Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })),
        ),
      },
      onPhase: (phase) => phases.push(phase),
      ...overrides,
    };
    return { value, phases };
  }

  const withImages = withElements(
    createImage(
      'i1',
      { id: 'present', width: 10, height: 10, name: 'a' },
      { width: 1000, height: 1000 },
    ),
    createImage(
      'i2',
      { id: 'gone', width: 10, height: 10, name: 'b' },
      { width: 1000, height: 1000 },
    ),
    rect(),
  );

  it('inlines images, rasterises PNG and reports each phase', async () => {
    const { value, phases } = deps();
    const result = await exportDesign(withImages, options(), value);
    expect(result).toMatchObject({
      fileName: 'Poster.png',
      mimeType: 'image/png',
      missingAssets: 1,
    });
    expect(value.renderer.render).toHaveBeenCalledWith(
      withImages,
      { present: 'data:image/png;base64,AAAA' },
      {
        width: 2000,
        height: 2000,
        transparent: false,
      },
    );
    expect(value.rasterizer.rasterize).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', background: null }),
    );
    expect(phases).toEqual(['collecting', 'rendering', 'encoding', 'done']);
  });

  it('puts JPEGs on white and keeps PNG/SVG transparency only when asked', async () => {
    const { value } = deps();
    await exportDesign(
      makeDocument(),
      options({ format: 'jpeg', transparent: true }),
      value,
    );
    expect(value.rasterizer.rasterize).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/jpeg',
        background: '#ffffff',
      }),
    );
    expect(value.renderer.render).toHaveBeenCalledWith(
      expect.anything(),
      {},
      expect.objectContaining({ transparent: false }),
    );
    await exportDesign(
      makeDocument(),
      options({ format: 'svg', transparent: true }),
      value,
    );
    expect(value.renderer.render).toHaveBeenLastCalledWith(
      expect.anything(),
      {},
      { width: 1000, height: 1000, transparent: true },
    );
  });

  it('writes SVG text directly and wraps a raster in a PDF page', async () => {
    const { value } = deps();
    const svg = await exportDesign(
      makeDocument(),
      options({ format: 'svg' }),
      value,
    );
    expect(svg.blob.type).toBe('image/svg+xml');
    expect(await svg.blob.text()).toBe('<svg/>');
    const pdf = await exportDesign(
      makeDocument({ name: 'Gala' }),
      options({ format: 'pdf' }),
      value,
    );
    expect(pdf).toMatchObject({
      fileName: 'Poster.pdf',
      mimeType: 'application/pdf',
    });
    expect(value.pdf.write).toHaveBeenCalledWith({
      image: png,
      width: 1000,
      height: 1000,
      title: 'Gala',
    });
  });

  it('refuses invalid options before doing any work', async () => {
    const { value } = deps();
    await expect(
      exportDesign(makeDocument(), options({ fileName: '' }), value),
    ).rejects.toBeInstanceOf(ExportError);
    expect(value.renderer.render).not.toHaveBeenCalled();
  });

  it('renders a standalone SVG file with the real renderer', async () => {
    const markup = await svgRenderer.render(
      withElements(rect()),
      {},
      { width: 500, height: 500, transparent: false },
    );
    expect(
      markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg'),
    ).toBe(true);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('viewBox="0 0 1000 1000"');
  });
});

describe('file delivery', () => {
  function environment(overrides: Partial<DeliveryEnvironment> = {}) {
    const later: (() => void)[] = [];
    const env: DeliveryEnvironment = {
      navigator: {
        share: vi.fn(() => Promise.resolve()),
        canShare: vi.fn(() => true),
        clipboard: {
          write: vi.fn(() => Promise.resolve()),
        } as unknown as Clipboard,
      },
      document,
      openUrl: vi.fn(),
      createObjectUrl: vi.fn(() => 'blob:x'),
      revokeObjectUrl: vi.fn(),
      hasClipboardItem: true,
      later: (run) => later.push(run),
      ...overrides,
    };
    return { env, later };
  }

  it('downloads through a temporary link and revokes the URL later', () => {
    const { env, later } = environment();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    createFileDelivery(env).download(new Blob(['x']), 'poster.png');
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(env.revokeObjectUrl).not.toHaveBeenCalled();
    later.forEach((run) => {
      run();
    });
    expect(env.revokeObjectUrl).toHaveBeenCalledWith('blob:x');
  });

  it('shares files when supported and treats dismissal as cancelled', async () => {
    const { env } = environment();
    const delivery = createFileDelivery(env);
    const file = new File(['x'], 'a.png');
    expect(delivery.canShareFiles(file)).toBe(true);
    expect(await delivery.share({ file, title: 't', text: 't' })).toBe(
      'shared',
    );
    vi.mocked(env.navigator.share).mockRejectedValueOnce(
      new DOMException('dismissed', 'AbortError'),
    );
    expect(await delivery.share({ file, title: 't', text: 't' })).toBe(
      'cancelled',
    );
    vi.mocked(env.navigator.share).mockRejectedValueOnce(new Error('denied'));
    await expect(
      delivery.share({ file, title: 't', text: 't' }),
    ).rejects.toThrow('denied');
  });

  it('reports missing share and clipboard support', () => {
    const { env } = environment({
      navigator: {
        clipboard: {} as Clipboard,
      } as DeliveryEnvironment['navigator'],
      hasClipboardItem: false,
    });
    const delivery = createFileDelivery(env);
    expect(delivery.canShareFiles(new File([], 'a'))).toBe(false);
    expect(delivery.canCopyImage()).toBe(false);
  });

  it('opens only mailto drafts', () => {
    const { env } = environment();
    const delivery = createFileDelivery(env);
    delivery.openEmailDraft('mailto:a@x.test');
    expect(env.openUrl).toHaveBeenCalledWith('mailto:a@x.test');
    expect(() => {
      delivery.openEmailDraft('javascript:alert(1)');
    }).toThrow();
  });

  it('copies images when the clipboard supports it', async () => {
    class FakeClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    const { env } = environment();
    const delivery = createFileDelivery(env);
    expect(delivery.canCopyImage()).toBe(true);
    await delivery.copyImage(new Blob(['png']));
    expect(env.navigator.clipboard.write).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('email drafts', () => {
  it('parses, de-duplicates and validates recipients', () => {
    expect(parseRecipients('')).toEqual({ ok: true, recipients: [] });
    expect(parseRecipients('A@x.test, b@x.test; a@x.test')).toEqual({
      ok: true,
      recipients: ['a@x.test', 'b@x.test'],
    });
    expect(parseRecipients('a@x.test, nope')).toEqual({
      ok: false,
      message: '“nope” isn’t a valid email address.',
    });
    const many = Array.from(
      { length: MAX_RECIPIENTS + 1 },
      (_, index) => `p${index}@x.test`,
    ).join(',');
    expect(parseRecipients(many)).toMatchObject({ ok: false });
  });

  it('builds an encoded mailto link that names the attachment', () => {
    const { url, truncated } = buildMailto({
      recipients: ['a@x.test'],
      subject: 'Gala & awards',
      body: 'See attached?',
      attachmentName: 'Gala.pdf',
    });
    expect(truncated).toBe(false);
    expect(url).toBe(
      `mailto:a%40x.test?subject=Gala%20%26%20awards&body=${encodeURIComponent('See attached?\n\n(Attached: Gala.pdf)')}`,
    );
  });

  it('shortens long messages to keep the link usable', () => {
    const { url, truncated } = buildMailto({
      recipients: [],
      subject: 'Hi',
      body: 'word '.repeat(1000),
      attachmentName: 'a.png',
    });
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
    expect(decodeURIComponent(url)).toContain('(Attached: a.png)');
  });
});

describe('browser delivery environment', () => {
  it('wraps the real browser objects', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const env = browserDeliveryEnvironment();
    expect(env.navigator).toBe(window.navigator);
    expect(env.createObjectUrl(new Blob(['x']))).toMatch(/^blob:/);
    env.revokeObjectUrl('blob:test/1');
    const run = vi.fn();
    env.later(run, 50);
    vi.advanceTimersByTime(50);
    expect(run).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
