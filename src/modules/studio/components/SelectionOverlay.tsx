import {
  bounds,
  center,
  corners,
  HANDLES,
  unionBounds,
  type Box,
  type Handle,
} from '@/modules/document/domain/geometry';
import type { DesignElement } from '@/modules/document/domain/schema';
import { useStudio } from '@/modules/studio/studioContext';

const HANDLE_DIRECTIONS: Record<Handle, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

const CURSORS = [
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
] as const;
const HANDLE_ANGLES: Record<Handle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};

function cursorFor(handle: Handle, rotation: number): string {
  const angle = (((HANDLE_ANGLES[handle] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(angle / 45) % 4] ?? 'move';
}

function handlesFor(element: DesignElement): readonly Handle[] {
  if (element.type === 'line') {
    return ['e', 'w'];
  }
  if (element.type === 'text') {
    return ['nw', 'ne', 'e', 'se', 'sw', 'w'];
  }
  return HANDLES;
}

function rotatePoint(x: number, y: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [
    x * Math.cos(radians) - y * Math.sin(radians),
    x * Math.sin(radians) + y * Math.cos(radians),
  ];
}

function Outline({
  element,
  className,
}: {
  element: DesignElement;
  className: string;
}) {
  return (
    <polygon
      className={className}
      points={corners(element)
        .map((point) => `${point.x},${point.y}`)
        .join(' ')}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function Handles({ element, zoom }: { element: DesignElement; zoom: number }) {
  const size = 9 / zoom;
  const mid = center(element);
  const [rotateX, rotateY] = rotatePoint(
    0,
    -element.height / 2 - 28 / zoom,
    element.rotation,
  );
  const [topX, topY] = rotatePoint(0, -element.height / 2, element.rotation);
  return (
    <g className="selection__handles">
      <line
        className="selection__stem"
        x1={mid.x + topX}
        y1={mid.y + topY}
        x2={mid.x + rotateX}
        y2={mid.y + rotateY}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        className="selection__rotate"
        data-handle="rotate"
        cx={mid.x + rotateX}
        cy={mid.y + rotateY}
        r={6 / zoom}
        vectorEffect="non-scaling-stroke"
      >
        <title>Rotate (Shift snaps to 15°)</title>
      </circle>
      {handlesFor(element).map((handle) => {
        const [dx, dy] = HANDLE_DIRECTIONS[handle];
        const [x, y] = rotatePoint(
          (dx * element.width) / 2,
          (dy * element.height) / 2,
          element.rotation,
        );
        return (
          <rect
            key={handle}
            className="selection__handle"
            data-handle={handle}
            x={mid.x + x - size / 2}
            y={mid.y + y - size / 2}
            width={size}
            height={size}
            rx={2 / zoom}
            transform={
              element.rotation
                ? `rotate(${element.rotation} ${mid.x + x} ${mid.y + y})`
                : undefined
            }
            style={{ cursor: cursorFor(handle, element.rotation) }}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

/**
 * Selection outlines, resize/rotate handles, hover outline, smart guides
 * and the marquee, drawn in document units over the artboard.
 */
export function SelectionOverlay({ marquee }: { marquee: Box | null }) {
  const document = useStudio((state) => state.history.present);
  const selection = useStudio((state) => state.selection);
  const hoveredId = useStudio((state) => state.hoveredId);
  const guides = useStudio((state) => state.guides);
  const zoom = useStudio((state) => state.zoom);
  const editingTextId = useStudio((state) => state.editingTextId);
  const gesturing = useStudio((state) => state.gestureStart !== null);
  const { width, height } = document.format;

  const selected = document.elements.filter((element) =>
    selection.includes(element.id),
  );
  const hovered =
    hoveredId && !selection.includes(hoveredId)
      ? document.elements.find((element) => element.id === hoveredId)
      : undefined;
  const single = selected.length === 1 ? selected[0] : undefined;
  const group = selected.length > 1 ? unionBounds(selected.map(bounds)) : null;

  return (
    <svg
      className="selection"
      viewBox={`0 0 ${width} ${height}`}
      width={width * zoom}
      height={height * zoom}
      overflow="visible"
      aria-hidden="true"
    >
      {hovered && <Outline element={hovered} className="selection__hover" />}
      {selected.map((element) => (
        <Outline
          key={element.id}
          element={element}
          className={
            element.locked
              ? 'selection__outline selection__outline--locked'
              : element.hidden
                ? 'selection__outline selection__outline--hidden'
                : 'selection__outline'
          }
        />
      ))}
      {group && (
        <rect
          className="selection__group"
          x={group.x}
          y={group.y}
          width={group.width}
          height={group.height}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {single &&
        !single.locked &&
        !single.hidden &&
        editingTextId !== single.id && <Handles element={single} zoom={zoom} />}
      {gesturing &&
        guides.map((guide) =>
          guide.axis === 'x' ? (
            <line
              key={`x${guide.position}`}
              className="selection__guide"
              x1={guide.position}
              x2={guide.position}
              y1={0}
              y2={height}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              key={`y${guide.position}`}
              className="selection__guide"
              x1={0}
              x2={width}
              y1={guide.position}
              y2={guide.position}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      {marquee && (
        <rect
          className="selection__marquee"
          x={marquee.x}
          y={marquee.y}
          width={marquee.width}
          height={marquee.height}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
