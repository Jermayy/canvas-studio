import type { Fill, Shadow, Stroke } from '@/modules/document/domain/schema';
import { SWATCHES } from '@/modules/library/presets';
import {
  ColorField,
  NumberField,
  Segmented,
  Slider,
  Toggle,
} from '@/shared/ui/fields';

/** Reusable property editors for fills, outlines and shadows. */

export function FillEditor({
  label,
  fill,
  onChange,
  allowNone = true,
}: {
  label: string;
  fill: Fill;
  onChange: (fill: Fill) => void;
  allowNone?: boolean;
}) {
  const solidColor =
    fill.kind === 'solid'
      ? fill.color
      : fill.kind === 'linear'
        ? fill.from
        : '#4f46e5';
  return (
    <div className="inspector-stack">
      <Segmented
        label={label}
        value={fill.kind}
        options={[
          ...(allowNone ? [{ value: 'none' as const, label: 'None' }] : []),
          { value: 'solid' as const, label: 'Solid' },
          { value: 'linear' as const, label: 'Gradient' },
        ]}
        onChange={(kind) => {
          if (kind === 'none') {
            onChange({ kind: 'none' });
          } else if (kind === 'solid') {
            onChange({ kind: 'solid', color: solidColor });
          } else {
            onChange({
              kind: 'linear',
              from: solidColor,
              to: '#ec4899',
              angle: 135,
            });
          }
        }}
      />
      {fill.kind === 'solid' && (
        <ColorField
          label="Colour"
          value={fill.color}
          swatches={SWATCHES}
          onCommit={(color) => {
            onChange({ kind: 'solid', color });
          }}
        />
      )}
      {fill.kind === 'linear' && (
        <>
          <div className="inspector-row">
            <ColorField
              label="From"
              value={fill.from}
              onCommit={(from) => {
                onChange({ ...fill, from });
              }}
            />
            <ColorField
              label="To"
              value={fill.to}
              onCommit={(to) => {
                onChange({ ...fill, to });
              }}
            />
          </div>
          <Slider
            label="Angle"
            value={fill.angle}
            min={0}
            max={360}
            format={(value) => `${value}°`}
            onCommit={(angle) => {
              onChange({ ...fill, angle });
            }}
          />
        </>
      )}
    </div>
  );
}

const DEFAULT_STROKE: Stroke = { color: '#111827', width: 4, dash: 'solid' };

export function StrokeEditor({
  stroke,
  onChange,
  optional = true,
  label = 'Outline',
}: {
  stroke: Stroke | null;
  onChange: (stroke: Stroke | null) => void;
  optional?: boolean;
  label?: string;
}) {
  return (
    <div className="inspector-stack">
      {optional && (
        <Toggle
          label={label}
          checked={stroke !== null}
          onChange={(on) => {
            onChange(on ? DEFAULT_STROKE : null);
          }}
        />
      )}
      {stroke && (
        <>
          <ColorField
            label={optional ? 'Outline colour' : 'Colour'}
            value={stroke.color}
            swatches={SWATCHES.slice(0, 10)}
            onCommit={(color) => {
              onChange({ ...stroke, color });
            }}
          />
          <div className="inspector-row">
            <NumberField
              label="Width"
              value={stroke.width}
              min={0}
              max={200}
              suffix="px"
              onCommit={(width) => {
                onChange({ ...stroke, width });
              }}
            />
            <Segmented
              label="Style"
              value={stroke.dash}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dash' },
                { value: 'dotted', label: 'Dot' },
              ]}
              onChange={(dash) => {
                onChange({ ...stroke, dash });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

const DEFAULT_SHADOW: Shadow = {
  color: '#0f172a',
  opacity: 0.25,
  blur: 24,
  offsetX: 0,
  offsetY: 10,
};

export function ShadowEditor({
  shadow,
  onChange,
}: {
  shadow: Shadow | null;
  onChange: (shadow: Shadow | null) => void;
}) {
  return (
    <div className="inspector-stack">
      <Toggle
        label="Drop shadow"
        checked={shadow !== null}
        onChange={(on) => {
          onChange(on ? DEFAULT_SHADOW : null);
        }}
      />
      {shadow && (
        <>
          <ColorField
            label="Shadow colour"
            value={shadow.color}
            onCommit={(color) => {
              onChange({ ...shadow, color });
            }}
          />
          <Slider
            label="Shadow opacity"
            value={Math.round(shadow.opacity * 100)}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            onCommit={(value) => {
              onChange({ ...shadow, opacity: value / 100 });
            }}
          />
          <div className="inspector-row inspector-row--3">
            <NumberField
              label="Blur"
              value={shadow.blur}
              min={0}
              max={200}
              onCommit={(blur) => {
                onChange({ ...shadow, blur });
              }}
            />
            <NumberField
              label="X"
              value={shadow.offsetX}
              min={-500}
              max={500}
              onCommit={(offsetX) => {
                onChange({ ...shadow, offsetX });
              }}
            />
            <NumberField
              label="Y"
              value={shadow.offsetY}
              min={-500}
              max={500}
              onCommit={(offsetY) => {
                onChange({ ...shadow, offsetY });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
