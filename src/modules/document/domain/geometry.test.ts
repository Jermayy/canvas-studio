import {
  bounds,
  boxFromPoints,
  center,
  corners,
  intersects,
  normaliseRotation,
  resizeBox,
  rotationFromPointer,
  roundTo,
  unionBounds,
} from '@/modules/document/domain/geometry';

const box = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };

function expectBox(
  actual: { x: number; y: number; width: number; height: number },
  expected: typeof actual,
) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.width).toBeCloseTo(expected.width, 5);
  expect(actual.height).toBeCloseTo(expected.height, 5);
}

describe('bounds', () => {
  it('is the box itself when unrotated', () => {
    expect(bounds(box)).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it('grows to contain a rotated box', () => {
    expectBox(bounds({ ...box, rotation: 90 }), {
      x: 150,
      y: 50,
      width: 100,
      height: 200,
    });
  });

  it('lists corners clockwise from the top-left', () => {
    expect(corners(box)).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
    ]);
  });
});

describe('unionBounds / intersects / boxFromPoints', () => {
  it('returns null for no boxes and the hull otherwise', () => {
    expect(unionBounds([])).toBeNull();
    expect(
      unionBounds([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 5, width: 10, height: 20 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 30, height: 25 });
  });

  it('detects overlap but not touching edges', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(intersects(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(intersects(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('normalises a drag in any direction', () => {
    expect(boxFromPoints({ x: 50, y: 40 }, { x: 10, y: 0 })).toEqual({
      x: 10,
      y: 0,
      width: 40,
      height: 40,
    });
  });
});

describe('resizeBox', () => {
  it('keeps the opposite corner fixed when dragging a corner', () => {
    const result = resizeBox(
      box,
      'se',
      { x: 400, y: 250 },
      { keepRatio: false },
    );
    expectBox(result, { x: 100, y: 100, width: 300, height: 150 });
  });

  it('dragging the north-west corner moves the origin', () => {
    const result = resizeBox(box, 'nw', { x: 50, y: 80 }, { keepRatio: false });
    expectBox(result, { x: 50, y: 80, width: 250, height: 120 });
  });

  it('edge handles change one dimension only', () => {
    expectBox(resizeBox(box, 'e', { x: 500, y: 999 }, { keepRatio: false }), {
      x: 100,
      y: 100,
      width: 400,
      height: 100,
    });
    expectBox(resizeBox(box, 'n', { x: 0, y: 50 }, { keepRatio: false }), {
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
  });

  it('keeps proportions on corners and edges when asked', () => {
    const corner = resizeBox(
      box,
      'se',
      { x: 500, y: 150 },
      { keepRatio: true },
    );
    expect(corner.width / corner.height).toBeCloseTo(2);
    expect(corner.width).toBeCloseTo(400);
    const edge = resizeBox(box, 's', { x: 0, y: 300 }, { keepRatio: true });
    expectBox(edge, { x: 0, y: 100, width: 400, height: 200 });
  });

  it('never shrinks below the minimum size', () => {
    const result = resizeBox(
      box,
      'se',
      { x: 0, y: 0 },
      { keepRatio: false, minSize: 10 },
    );
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('resizes along the element’s own axes when rotated', () => {
    const rotated = { x: 0, y: 0, width: 100, height: 100, rotation: 90 };
    // Rotated 90°, the local "east" handle points down the screen.
    const result = resizeBox(
      rotated,
      'e',
      { x: 50, y: 150 },
      { keepRatio: false },
    );
    expect(result.width).toBeCloseTo(150);
    expect(result.height).toBeCloseTo(100);
    expect(center(result).x).toBeCloseTo(50);
    expect(center(result).y).toBeCloseTo(75);
  });
});

describe('rotation', () => {
  it('measures from straight up, clockwise', () => {
    const c = { x: 0, y: 0 };
    expect(rotationFromPointer(c, { x: 0, y: -10 }, null)).toBe(0);
    expect(rotationFromPointer(c, { x: 10, y: 0 }, null)).toBe(90);
    expect(rotationFromPointer(c, { x: -10, y: 0 }, null)).toBe(-90);
  });

  it('snaps when asked', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: -9 }, 15)).toBe(45);
  });

  it('normalises into (-180, 180]', () => {
    expect(normaliseRotation(270)).toBe(-90);
    expect(normaliseRotation(-450)).toBe(-90);
    expect(normaliseRotation(180)).toBe(180);
    expect(roundTo(1.23456, 2)).toBe(1.23);
  });
});
