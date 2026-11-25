import { useWorkspaceState } from '@/app/services';
import {
  CATEGORIES,
  FONTS,
  FORMATS,
  formatById,
  type CategoryId,
  type FontId,
} from '@/modules/document/domain/catalog';
import { describeElement } from '@/modules/document/domain/layers';
import type { Alignment } from '@/modules/document/domain/operations';
import type {
  DesignElement,
  ElementPatch,
  ImageElement,
  LineCap,
  LineElement,
  ShapeElement,
  TextElement,
  IconElement,
} from '@/modules/document/domain/schema';
import { iconLabel } from '@/modules/library/iconCatalog';
import { SWATCHES } from '@/modules/library/presets';
import {
  FillEditor,
  ShadowEditor,
  StrokeEditor,
} from '@/modules/studio/components/inspector/StyleEditors';
import { LayerKindIcon } from '@/modules/studio/components/LayerKindIcon';
import { selectedElements } from '@/modules/studio/state/studioStore';
import { useStudio, useStudioActions } from '@/modules/studio/studioContext';
import { IconButton } from '@/shared/ui/Button';
import {
  ColorField,
  NumberField,
  Segmented,
  SelectField,
  Slider,
  Toggle,
} from '@/shared/ui/fields';
import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h3 className="inspector-section__title">{title}</h3>
      {children}
    </section>
  );
}

const ALIGNMENTS: readonly {
  value: Alignment;
  icon: Parameters<typeof IconButton>[0]['icon'];
  label: string;
}[] = [
  { value: 'left', icon: 'align-left', label: 'Align left' },
  { value: 'center', icon: 'align-center', label: 'Align centre' },
  { value: 'right', icon: 'align-right', label: 'Align right' },
  { value: 'top', icon: 'align-top', label: 'Align top' },
  { value: 'middle', icon: 'align-middle', label: 'Align middle' },
  { value: 'bottom', icon: 'align-bottom', label: 'Align bottom' },
];

function AlignmentTools({ count }: { count: number }) {
  const { alignSelected, distributeSelected, reorderSelected } =
    useStudioActions();
  const target = count > 1 ? 'selection' : 'page';
  return (
    <>
      <div className="inspector-label-row">
        <span className="field__label">Align</span>
        <span className="inspector-hint">to {target}</span>
      </div>
      <div
        className="button-row"
        role="group"
        aria-label={`Align to ${target}`}
      >
        {ALIGNMENTS.map((alignment) => (
          <IconButton
            key={alignment.value}
            icon={alignment.icon}
            label={`${alignment.label} to ${target}`}
            size="sm"
            onClick={() => {
              alignSelected(alignment.value);
            }}
          />
        ))}
      </div>
      {count >= 3 && (
        <div className="button-row" role="group" aria-label="Distribute">
          <IconButton
            icon="distribute-h"
            label="Distribute horizontally"
            size="sm"
            onClick={() => {
              distributeSelected('horizontal');
            }}
          />
          <IconButton
            icon="distribute-v"
            label="Distribute vertically"
            size="sm"
            onClick={() => {
              distributeSelected('vertical');
            }}
          />
        </div>
      )}
      <span className="field__label">Layer order</span>
      <div className="button-row" role="group" aria-label="Layer order">
        <IconButton
          icon="bring-front"
          label="Bring to front"
          shortcut="⇧]"
          size="sm"
          onClick={() => {
            reorderSelected('front');
          }}
        />
        <IconButton
          icon="chevron-up"
          label="Bring forward"
          shortcut="]"
          size="sm"
          onClick={() => {
            reorderSelected('forward');
          }}
        />
        <IconButton
          icon="chevron-down"
          label="Send backward"
          shortcut="["
          size="sm"
          onClick={() => {
            reorderSelected('backward');
          }}
        />
        <IconButton
          icon="send-back"
          label="Send to back"
          shortcut="⇧["
          size="sm"
          onClick={() => {
            reorderSelected('back');
          }}
        />
      </div>
    </>
  );
}

function GeometrySection({ element }: { element: DesignElement }) {
  const { update } = useStudioActions();
  const [ratioLocked, setRatioLocked] = useState(
    element.type === 'image' || element.type === 'icon',
  );
  const set = (patch: ElementPatch) => {
    update([element.id], patch);
  };
  const ratio = element.width / element.height;
  return (
    <Section title="Position & size">
      <div className="inspector-row">
        <NumberField
          label="X"
          value={element.x}
          min={-20000}
          max={20000}
          onCommit={(x) => {
            set({ x });
          }}
        />
        <NumberField
          label="Y"
          value={element.y}
          min={-20000}
          max={20000}
          onCommit={(y) => {
            set({ y });
          }}
        />
      </div>
      <div className="inspector-row inspector-row--lock">
        <NumberField
          label="W"
          value={element.width}
          min={1}
          max={20000}
          onCommit={(width) => {
            set(
              ratioLocked && element.type !== 'text'
                ? { width, height: width / ratio }
                : { width },
            );
          }}
        />
        <NumberField
          label="H"
          value={element.height}
          min={1}
          max={20000}
          disabled={element.type === 'text'}
          onCommit={(height) => {
            set(ratioLocked ? { height, width: height * ratio } : { height });
          }}
        />
        <IconButton
          icon={ratioLocked ? 'lock' : 'unlock'}
          label={ratioLocked ? 'Unlock proportions' : 'Lock proportions'}
          pressed={ratioLocked}
          size="sm"
          disabled={element.type === 'text'}
          onClick={() => {
            setRatioLocked((value) => !value);
          }}
        />
      </div>
      {element.type === 'text' && (
        <p className="inspector-hint">Text height grows with its content.</p>
      )}
      <div className="inspector-row">
        <NumberField
          label="Rotate"
          value={element.rotation}
          min={-360}
          max={360}
          suffix="°"
          onCommit={(rotation) => {
            set({ rotation });
          }}
        />
      </div>
      <Slider
        label="Opacity"
        value={Math.round(element.opacity * 100)}
        min={0}
        max={100}
        format={(value) => `${value}%`}
        onCommit={(value) => {
          set({ opacity: value / 100 });
        }}
      />
    </Section>
  );
}

function ShapeSection({ element }: { element: ShapeElement }) {
  const { update } = useStudioActions();
  const set = (patch: ElementPatch) => {
    update([element.id], patch);
  };
  return (
    <>
      <Section title="Fill">
        <FillEditor
          label="Fill type"
          fill={element.fill}
          onChange={(fill) => {
            set({ fill });
          }}
        />
      </Section>
      <Section title="Outline">
        <StrokeEditor
          stroke={element.stroke}
          onChange={(stroke) => {
            set({ stroke });
          }}
        />
        {element.shape === 'rectangle' && (
          <NumberField
            label="Corners"
            value={element.cornerRadius}
            min={0}
            max={1000}
            suffix="px"
            onCommit={(cornerRadius) => {
              set({ cornerRadius });
            }}
          />
        )}
      </Section>
      <Section title="Effects">
        <ShadowEditor
          shadow={element.shadow}
          onChange={(shadow) => {
            set({ shadow });
          }}
        />
      </Section>
    </>
  );
}

const WEIGHTS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' },
] as const;

function TextContent({ element }: { element: TextElement }) {
  const { update } = useStudioActions();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="field">
      <label className="field__label" htmlFor={`text-${element.id}`}>
        Content
      </label>
      <textarea
        id={`text-${element.id}`}
        className="input textarea"
        rows={3}
        value={draft ?? element.text}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (draft !== null && draft !== element.text) {
            update([element.id], { text: draft });
          }
          setDraft(null);
        }}
      />
      <p className="field__hint">
        Tip: double-click text on the canvas to edit it in place.
      </p>
    </div>
  );
}

function TextSection({ element }: { element: TextElement }) {
  const { update } = useStudioActions();
  const set = (patch: ElementPatch) => {
    update([element.id], patch);
  };
  return (
    <>
      <Section title="Text">
        <TextContent key={element.id} element={element} />
        <SelectField<FontId>
          label="Font"
          value={element.fontFamily}
          options={FONTS.map((font) => ({ value: font.id, label: font.label }))}
          onChange={(fontFamily) => {
            set({ fontFamily });
          }}
        />
        <div className="inspector-row">
          <NumberField
            label="Size"
            value={element.fontSize}
            min={4}
            max={1000}
            suffix="px"
            onCommit={(fontSize) => {
              set({ fontSize });
            }}
          />
          <SelectField<(typeof WEIGHTS)[number]['value']>
            label="Weight"
            value={
              WEIGHTS.find(
                (weight) => Number(weight.value) === element.fontWeight,
              )?.value ?? '400'
            }
            options={WEIGHTS}
            onChange={(weight) => {
              set({ fontWeight: Number(weight) });
            }}
          />
        </div>
        <div className="inspector-row">
          <Segmented
            label="Alignment"
            value={element.align}
            options={[
              { value: 'left', label: 'Left', icon: 'text-left' },
              { value: 'center', label: 'Centre', icon: 'text-center' },
              { value: 'right', label: 'Right', icon: 'text-right' },
            ]}
            onChange={(align) => {
              set({ align });
            }}
          />
          <div
            className="button-row button-row--end"
            role="group"
            aria-label="Style"
          >
            <IconButton
              icon="italic"
              label="Italic"
              pressed={element.italic}
              size="sm"
              onClick={() => {
                set({ italic: !element.italic });
              }}
            />
            <IconButton
              icon="uppercase"
              label="All caps"
              pressed={element.uppercase}
              size="sm"
              onClick={() => {
                set({ uppercase: !element.uppercase });
              }}
            />
          </div>
        </div>
        <ColorField
          label="Colour"
          value={element.color}
          swatches={SWATCHES}
          onCommit={(color) => {
            set({ color });
          }}
        />
        <div className="inspector-row">
          <NumberField
            label="Line height"
            value={element.lineHeight}
            min={0.5}
            max={4}
            step={0.05}
            onCommit={(lineHeight) => {
              set({ lineHeight });
            }}
          />
          <NumberField
            label="Spacing"
            value={element.letterSpacing}
            min={-20}
            max={100}
            step={0.5}
            suffix="px"
            onCommit={(letterSpacing) => {
              set({ letterSpacing });
            }}
          />
        </div>
      </Section>
      <Section title="Effects">
        <ShadowEditor
          shadow={element.shadow}
          onChange={(shadow) => {
            set({ shadow });
          }}
        />
      </Section>
    </>
  );
}

const CAPS: readonly { value: LineCap; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'circle', label: 'Dot' },
];

function LineSection({ element }: { element: LineElement }) {
  const { update } = useStudioActions();
  const set = (patch: ElementPatch) => {
    update([element.id], patch);
  };
  return (
    <Section title="Line">
      <StrokeEditor
        optional={false}
        stroke={element.stroke}
        onChange={(stroke) => {
          if (stroke) {
            set({ stroke });
          }
        }}
      />
      <div className="inspector-row">
        <SelectField<LineCap>
          label="Start"
          value={element.startCap}
          options={CAPS}
          onChange={(startCap) => {
            set({ startCap });
          }}
        />
        <SelectField<LineCap>
          label="End"
          value={element.endCap}
          options={CAPS}
          onChange={(endCap) => {
            set({ endCap });
          }}
        />
      </div>
    </Section>
  );
}

function IconSection({ element }: { element: IconElement }) {
  const { update } = useStudioActions();
  return (
    <Section title="Icon">
      <ColorField
        label="Colour"
        value={element.color}
        swatches={SWATCHES}
        onCommit={(color) => {
          update([element.id], { color });
        }}
      />
      <Slider
        label="Line weight"
        value={element.strokeWidth}
        min={0.5}
        max={4}
        step={0.25}
        format={(value) => `${value}`}
        onCommit={(strokeWidth) => {
          update([element.id], { strokeWidth });
        }}
      />
    </Section>
  );
}

function ImageSection({ element }: { element: ImageElement }) {
  const { update } = useStudioActions();
  const asset = useWorkspaceState((state) =>
    state.assets.find((item) => item.id === element.assetId),
  );
  const set = (patch: ElementPatch) => {
    update([element.id], patch);
  };
  return (
    <Section title="Image">
      {asset ? (
        <p className="inspector-hint">
          {asset.name} · {asset.width}×{asset.height}px original
        </p>
      ) : (
        <p className="inspector-hint inspector-hint--warning">
          The original file isn’t in this workspace, so a placeholder is shown.
        </p>
      )}
      <Segmented
        label="Fit"
        value={element.fit}
        options={[
          { value: 'cover', label: 'Fill frame' },
          { value: 'contain', label: 'Fit inside' },
        ]}
        onChange={(fit) => {
          set({ fit });
        }}
      />
      <NumberField
        label="Corners"
        value={element.cornerRadius}
        min={0}
        max={1000}
        suffix="px"
        onCommit={(cornerRadius) => {
          set({ cornerRadius });
        }}
      />
      <StrokeEditor
        label="Border"
        stroke={element.stroke}
        onChange={(stroke) => {
          set({ stroke });
        }}
      />
    </Section>
  );
}

function TypeSection({ element }: { element: DesignElement }) {
  switch (element.type) {
    case 'shape':
      return <ShapeSection element={element} />;
    case 'text':
      return <TextSection element={element} />;
    case 'line':
      return <LineSection element={element} />;
    case 'icon':
      return <IconSection element={element} />;
    case 'image':
      return <ImageSection element={element} />;
  }
}

function ElementHeader({ element }: { element: DesignElement }) {
  const { toggleHidden, toggleLocked } = useStudioActions();
  const description = describeElement(element, iconLabel);
  return (
    <div className="inspector-header">
      <LayerKindIcon element={element} />
      <div className="inspector-header__text">
        <span className="inspector-header__title">{description.title}</span>
        <span className="inspector-header__detail">{description.kind}</span>
      </div>
      <IconButton
        icon={element.hidden ? 'eye-off' : 'eye'}
        label={element.hidden ? 'Show layer' : 'Hide layer'}
        pressed={element.hidden}
        size="sm"
        onClick={() => {
          toggleHidden(element.id);
        }}
      />
      <IconButton
        icon={element.locked ? 'lock' : 'unlock'}
        label={element.locked ? 'Unlock layer' : 'Lock layer'}
        pressed={element.locked}
        size="sm"
        onClick={() => {
          toggleLocked(element.id);
        }}
      />
    </div>
  );
}

function DocumentProperties() {
  const document = useStudio((state) => state.history.present);
  const { updateDocument } = useStudioActions();
  const preset = formatById(document.format.id);
  return (
    <>
      <div className="inspector-intro">
        <strong>Page</strong>
        <p>
          Nothing is selected. Click a layer to edit it; Shift-click or drag a
          box to select several.
        </p>
      </div>
      <Section title="Size">
        <SelectField<string>
          label="Format"
          value={preset ? preset.id : 'custom'}
          options={[
            ...FORMATS.map((format) => ({
              value: format.id,
              label: `${format.label} — ${format.detail}`,
            })),
            { value: 'custom', label: 'Custom size' },
          ]}
          onChange={(id) => {
            const format = formatById(id);
            updateDocument({
              format: format
                ? { id: format.id, width: format.width, height: format.height }
                : { ...document.format, id: 'custom' },
            });
          }}
        />
        <div className="inspector-row">
          <NumberField
            label="W"
            value={document.format.width}
            min={16}
            max={8000}
            suffix="px"
            onCommit={(width) => {
              updateDocument({
                format: {
                  id: 'custom',
                  width: Math.round(width),
                  height: document.format.height,
                },
              });
            }}
          />
          <NumberField
            label="H"
            value={document.format.height}
            min={16}
            max={8000}
            suffix="px"
            onCommit={(height) => {
              updateDocument({
                format: {
                  id: 'custom',
                  width: document.format.width,
                  height: Math.round(height),
                },
              });
            }}
          />
        </div>
      </Section>
      <Section title="Background">
        <FillEditor
          label="Background type"
          fill={document.background}
          onChange={(background) => {
            updateDocument({ background });
          }}
        />
        {document.background.kind === 'none' && (
          <p className="inspector-hint">
            Transparent: PNG and SVG exports keep the transparency.
          </p>
        )}
      </Section>
      <Section title="Project">
        <SelectField<CategoryId>
          label="Template type"
          value={document.category}
          options={CATEGORIES.map((category) => ({
            value: category.id,
            label: category.label,
          }))}
          onChange={(category) => {
            updateDocument({ category });
          }}
        />
        <p className="inspector-hint">
          Used to filter your projects dashboard.
        </p>
      </Section>
    </>
  );
}

export function Inspector() {
  const selected = useStudio(useShallow(selectedElements));
  const { updateSelected } = useStudioActions();
  const first = selected[0];

  if (!first) {
    return <DocumentProperties />;
  }
  if (selected.length > 1) {
    const opacity = Math.round(
      (selected.reduce((sum, element) => sum + element.opacity, 0) /
        selected.length) *
        100,
    );
    return (
      <>
        <div className="inspector-intro">
          <strong>{selected.length} layers selected</strong>
          <p>Changes here apply to all of them. Locked layers aren’t moved.</p>
        </div>
        <Section title="Arrange">
          <AlignmentTools count={selected.length} />
        </Section>
        <Section title="Appearance">
          <Slider
            label="Opacity"
            value={opacity}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            onCommit={(value) => {
              updateSelected({ opacity: value / 100 });
            }}
          />
          <Toggle
            label="Locked"
            checked={selected.every((element) => element.locked)}
            onChange={(locked) => {
              updateSelected({ locked });
            }}
          />
        </Section>
      </>
    );
  }
  return (
    <>
      <ElementHeader element={first} />
      {first.locked && (
        <p className="inspector-hint inspector-hint--warning">
          This layer is locked: it can’t be moved, resized or deleted on the
          canvas. Unlock it to make changes there.
        </p>
      )}
      <GeometrySection key={first.id} element={first} />
      <Section title="Arrange">
        <AlignmentTools count={1} />
      </Section>
      <TypeSection element={first} />
    </>
  );
}
