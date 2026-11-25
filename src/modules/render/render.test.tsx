import { createImage } from '@/modules/document/domain/elementFactory';
import { DesignSvg } from '@/modules/render/DesignSvg';
import {
  dashArray,
  fillPaint,
  gradientVector,
  shapePath,
} from '@/modules/render/shapeGeometry';
import { SHAPE_KINDS } from '@/modules/document/domain/schema';
import {
  icon,
  line,
  makeDocument,
  rect,
  text,
  withElements,
} from '@/test/factories';
import { render } from '@testing-library/react';

describe('shape geometry', () => {
  it('draws every shape as a closed path inside its box', () => {
    for (const shape of SHAPE_KINDS) {
      const path = shapePath(shape, 200, 100, 10);
      expect(path.trim().endsWith('Z')).toBe(true);
      const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(200);
    }
    expect(shapePath('rectangle', 10, 10, 0)).toBe('M0 0 H10 V10 H0 Z');
  });

  it('maps stroke styles, gradient angles and fills', () => {
    expect(
      dashArray({ color: '#000000', width: 2, dash: 'solid' }),
    ).toBeUndefined();
    expect(dashArray({ color: '#000000', width: 2, dash: 'dashed' })).toBe(
      '6 4',
    );
    expect(dashArray({ color: '#000000', width: 2, dash: 'dotted' })).toBe(
      '0 4',
    );
    expect(gradientVector(90)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(gradientVector(180)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
    expect(fillPaint({ kind: 'none' }, 'g')).toBe('none');
    expect(fillPaint({ kind: 'solid', color: '#123456' }, 'g')).toBe('#123456');
    expect(
      fillPaint(
        { kind: 'linear', from: '#000000', to: '#ffffff', angle: 0 },
        'g',
      ),
    ).toBe('url(#g)');
  });
});

describe('DesignSvg', () => {
  it('renders every element kind and skips hidden or skipped ones', () => {
    const image = createImage(
      'img',
      { id: 'asset', width: 100, height: 100, name: 'a' },
      { width: 1000, height: 1000 },
    );
    const document = withElements(
      rect({
        id: 'r',
        fill: { kind: 'linear', from: '#000000', to: '#ffffff', angle: 45 },
        shadow: {
          color: '#000000',
          opacity: 0.2,
          blur: 4,
          offsetX: 0,
          offsetY: 2,
        },
        stroke: { color: '#ff0000', width: 2, dash: 'dashed' },
      }),
      text({
        id: 't',
        text: 'Line one\nLine two',
        align: 'center',
        shadow: {
          color: '#000000',
          opacity: 0.2,
          blur: 4,
          offsetX: 0,
          offsetY: 2,
        },
      }),
      line({ id: 'l', startCap: 'arrow', endCap: 'circle' }),
      line({ id: 'l2', startCap: 'circle', endCap: 'arrow', dash: 'dotted' }),
      icon({ id: 'i' }),
      icon({ id: 'unknown', icon: 'not-real' }),
      {
        ...image,
        rotation: 30,
        opacity: 0.5,
        stroke: { color: '#000000', width: 1, dash: 'solid' },
      },
      { ...rect({ id: 'hidden' }), hidden: true },
      text({ id: 'editing', text: 'Being edited' }),
    );
    const { container } = render(
      <DesignSvg
        document={document}
        assetUrls={{ asset: 'blob:asset' }}
        interactive
        title="Poster"
        skipIds={new Set(['editing'])}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Poster');
    const ids = [...container.querySelectorAll('[data-element-id]')].map(
      (node) => node.getAttribute('data-element-id'),
    );
    expect(ids).toEqual(['r', 't', 'l', 'l2', 'i', 'unknown', 'img']);
    expect(container.querySelectorAll('tspan')).toHaveLength(2);
    expect(container.querySelector('image')?.getAttribute('href')).toBe(
      'blob:asset',
    );
    expect(container.querySelectorAll('linearGradient').length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('feDropShadow')).toHaveLength(2);
    expect(container.querySelector('[transform^="rotate(30"]')).not.toBeNull();
  });

  it('shows a placeholder for missing images and can leave out the background', () => {
    const image = createImage(
      'img',
      { id: 'gone', width: 100, height: 100, name: 'a' },
      { width: 1000, height: 1000 },
    );
    const { container } = render(
      <DesignSvg document={withElements(image)} assetUrls={{}} transparent />,
    );
    expect(container.querySelector('[data-missing-asset]')).not.toBeNull();
    expect(container.querySelector('[data-background]')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('draws gradient and solid page backgrounds at the requested size', () => {
    const { container } = render(
      <DesignSvg
        document={makeDocument({
          background: {
            kind: 'linear',
            from: '#000000',
            to: '#ffffff',
            angle: 90,
          },
        })}
        assetUrls={{}}
        width={250}
        height={250}
      />,
    );
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('250');
    expect(
      container.querySelector('[data-background]')?.getAttribute('fill'),
    ).toMatch(/^url\(#/);
  });
});
