import { fontById } from '@/modules/document/domain/catalog';
import type {
  DesignDocument,
  DesignElement,
  Fill,
  IconElement,
  ImageElement,
  LineElement,
  Shadow,
  ShapeElement,
  Stroke,
  TextElement,
} from '@/modules/document/domain/schema';
import { layoutText } from '@/modules/document/domain/textLayout';
import { iconById } from '@/modules/library/iconCatalog';
import {
  dashArray,
  fillPaint,
  gradientVector,
  shapePath,
} from '@/modules/render/shapeGeometry';
import { createElement, useId, type ReactNode } from 'react';

/**
 * Renders a design as SVG. The same component draws the editor canvas,
 * dashboard thumbnails, and (through renderToStaticMarkup) every export,
 * so what you see is exactly what you download.
 */

export type AssetUrls = Readonly<Record<string, string>>;

export interface DesignSvgProps {
  document: DesignDocument;
  assetUrls: AssetUrls;
  /** Rendered size; defaults to the design's own pixel size. */
  width?: number;
  height?: number;
  /** Adds hit-testing hooks for the editor. Hidden elements never render. */
  interactive?: boolean;
  /** Accessible name; decorative when omitted. */
  title?: string;
  /** Leaves the background out (transparent PNG/SVG exports). */
  transparent?: boolean;
  /** Elements drawn elsewhere for now (e.g. text being edited in place). */
  skipIds?: ReadonlySet<string>;
  className?: string;
}

function GradientDef({ id, fill }: { id: string; fill: Fill }) {
  if (fill.kind !== 'linear') {
    return null;
  }
  const vector = gradientVector(fill.angle);
  return (
    <linearGradient id={id} {...vector}>
      <stop offset="0" stopColor={fill.from} />
      <stop offset="1" stopColor={fill.to} />
    </linearGradient>
  );
}

function ShadowDef({ id, shadow }: { id: string; shadow: Shadow }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow
        dx={shadow.offsetX}
        dy={shadow.offsetY}
        stdDeviation={shadow.blur / 2}
        floodColor={shadow.color}
        floodOpacity={shadow.opacity}
      />
    </filter>
  );
}

function strokeProps(stroke: Stroke | null) {
  if (!stroke || stroke.width === 0) {
    return {};
  }
  return {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeDasharray: dashArray(stroke),
    strokeLinecap:
      stroke.dash === 'dotted' ? ('round' as const) : ('butt' as const),
  };
}

function ShapeView({
  element,
  idBase,
}: {
  element: ShapeElement;
  idBase: string;
}) {
  const gradientId = `${idBase}-fill`;
  const shadowId = `${idBase}-shadow`;
  return (
    <>
      <defs>
        <GradientDef id={gradientId} fill={element.fill} />
        {element.shadow && <ShadowDef id={shadowId} shadow={element.shadow} />}
      </defs>
      <path
        d={shapePath(
          element.shape,
          element.width,
          element.height,
          element.cornerRadius,
        )}
        fill={fillPaint(element.fill, gradientId)}
        filter={element.shadow ? `url(#${shadowId})` : undefined}
        strokeLinejoin="round"
        {...strokeProps(element.stroke)}
      />
    </>
  );
}

function capSize(stroke: Stroke): number {
  return Math.max(10, stroke.width * 3);
}

function LineView({ element }: { element: LineElement }) {
  const { stroke, width, height } = element;
  const middle = height / 2;
  const cap = capSize(stroke);
  const start = element.startCap === 'none' ? 0 : cap / 2;
  const end = element.endCap === 'none' ? width : width - cap / 2;
  return (
    <>
      <line
        x1={start}
        y1={middle}
        x2={Math.max(start, end)}
        y2={middle}
        {...strokeProps(stroke)}
        strokeLinecap={stroke.dash === 'dotted' ? 'round' : 'butt'}
      />
      {element.startCap === 'arrow' && (
        <path
          d={`M0 ${middle} L${cap} ${middle - cap / 2} L${cap} ${middle + cap / 2} Z`}
          fill={stroke.color}
        />
      )}
      {element.endCap === 'arrow' && (
        <path
          d={`M${width} ${middle} L${width - cap} ${middle - cap / 2} L${width - cap} ${middle + cap / 2} Z`}
          fill={stroke.color}
        />
      )}
      {element.startCap === 'circle' && (
        <circle cx={cap / 2} cy={middle} r={cap / 2} fill={stroke.color} />
      )}
      {element.endCap === 'circle' && (
        <circle
          cx={width - cap / 2}
          cy={middle}
          r={cap / 2}
          fill={stroke.color}
        />
      )}
    </>
  );
}

const ANCHORS = { left: 'start', center: 'middle', right: 'end' } as const;

function TextView({
  element,
  idBase,
}: {
  element: TextElement;
  idBase: string;
}) {
  const layout = layoutText(element);
  const shadowId = `${idBase}-shadow`;
  const anchorX =
    element.align === 'left'
      ? 0
      : element.align === 'center'
        ? element.width / 2
        : element.width;
  // Approximate cap/ascender placement so the box hugs the glyphs.
  const firstBaseline =
    (layout.lineHeight - element.fontSize) / 2 + element.fontSize * 0.82;
  return (
    <>
      {element.shadow && (
        <defs>
          <ShadowDef id={shadowId} shadow={element.shadow} />
        </defs>
      )}
      <text
        fill={element.color}
        fontFamily={fontById(element.fontFamily).stack}
        fontSize={element.fontSize}
        fontWeight={element.fontWeight}
        fontStyle={element.italic ? 'italic' : 'normal'}
        letterSpacing={element.letterSpacing || undefined}
        textAnchor={ANCHORS[element.align]}
        filter={element.shadow ? `url(#${shadowId})` : undefined}
        xmlSpace="preserve"
      >
        {/* Lines have no identity beyond their position. */}
        {layout.lines.map((line, index) => (
          <tspan
            key={index}
            x={anchorX}
            y={firstBaseline + index * layout.lineHeight}
          >
            {line || ' '}
          </tspan>
        ))}
      </text>
    </>
  );
}

function ImageView({
  element,
  idBase,
  url,
}: {
  element: ImageElement;
  idBase: string;
  url: string | undefined;
}) {
  const clipId = `${idBase}-clip`;
  const radius = Math.min(
    element.cornerRadius,
    element.width / 2,
    element.height / 2,
  );
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect
            width={element.width}
            height={element.height}
            rx={radius}
            ry={radius}
          />
        </clipPath>
      </defs>
      {url ? (
        <image
          href={url}
          width={element.width}
          height={element.height}
          preserveAspectRatio={
            element.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
          }
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <rect
          width={element.width}
          height={element.height}
          rx={radius}
          fill="#e5e7eb"
          stroke="#9ca3af"
          strokeDasharray="8 6"
          data-missing-asset="true"
        />
      )}
      {element.stroke && (
        <rect
          width={element.width}
          height={element.height}
          rx={radius}
          ry={radius}
          fill="none"
          {...strokeProps(element.stroke)}
        />
      )}
    </>
  );
}

function IconView({ element }: { element: IconElement }) {
  const entry = iconById(element.icon);
  if (!entry) {
    return (
      <rect
        width={element.width}
        height={element.height}
        fill="none"
        stroke="#9ca3af"
        strokeDasharray="6 4"
      />
    );
  }
  return (
    <svg
      width={element.width}
      height={element.height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={element.color}
      strokeWidth={element.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
    >
      {entry.node.map(([tag, attributes], index) =>
        createElement(tag, { ...attributes, key: index }),
      )}
    </svg>
  );
}

function ElementContent({
  element,
  idBase,
  assetUrls,
}: {
  element: DesignElement;
  idBase: string;
  assetUrls: AssetUrls;
}): ReactNode {
  switch (element.type) {
    case 'shape':
      return <ShapeView element={element} idBase={idBase} />;
    case 'line':
      return <LineView element={element} />;
    case 'text':
      return <TextView element={element} idBase={idBase} />;
    case 'image':
      return (
        <ImageView
          element={element}
          idBase={idBase}
          url={assetUrls[element.assetId]}
        />
      );
    case 'icon':
      return <IconView element={element} />;
  }
}

export function DesignSvg({
  document,
  assetUrls,
  width,
  height,
  interactive = false,
  title,
  transparent = false,
  skipIds,
  className,
}: DesignSvgProps) {
  const idPrefix = `d${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { width: docWidth, height: docHeight } = document.format;
  const backgroundId = `${idPrefix}-bg`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${docWidth} ${docHeight}`}
      width={width ?? docWidth}
      height={height ?? docHeight}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {!transparent && (
        <>
          <defs>
            <GradientDef id={backgroundId} fill={document.background} />
          </defs>
          <rect
            width={docWidth}
            height={docHeight}
            fill={fillPaint(document.background, backgroundId)}
            data-background="true"
          />
        </>
      )}
      {document.elements.map((element) => {
        if (element.hidden || skipIds?.has(element.id)) {
          return null;
        }
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        const idBase = `${idPrefix}-${element.id.replace(/[^a-zA-Z0-9-]/g, '')}`;
        return (
          <g
            key={element.id}
            transform={
              element.rotation
                ? `rotate(${element.rotation} ${cx} ${cy})`
                : undefined
            }
            opacity={element.opacity < 1 ? element.opacity : undefined}
            data-element-id={interactive ? element.id : undefined}
            style={
              interactive
                ? { cursor: element.locked ? 'default' : 'move' }
                : undefined
            }
          >
            <g transform={`translate(${element.x} ${element.y})`}>
              {interactive && (
                <rect
                  width={element.width}
                  height={element.height}
                  fill="transparent"
                />
              )}
              <ElementContent
                element={element}
                idBase={idBase}
                assetUrls={assetUrls}
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
