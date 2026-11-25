import { useWorkspaceState } from '@/app/services';
import {
  createDocument,
  createImage,
} from '@/modules/document/domain/elementFactory';
import type { Fill } from '@/modules/document/domain/schema';
import {
  ICON_CATALOG,
  ICON_GROUPS,
  searchIcons,
} from '@/modules/library/iconCatalog';
import {
  BACKGROUND_PRESETS,
  EXTRA_SHAPE_PRESETS,
  iconPreset,
  LINE_PRESETS,
  PRESET_MIME,
  SHAPE_PRESETS,
  TEXT_COMBOS,
  TEXT_PRESETS,
  type Preset,
} from '@/modules/library/presets';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { fillPaint, gradientVector } from '@/modules/render/shapeGeometry';
import { useImageUpload } from '@/modules/studio/hooks/useImageUpload';
import { useAssetUrls } from '@/modules/workspace/hooks/useAssetUrls';
import {
  useStudio,
  useStudioActions,
  type InsertTab,
} from '@/modules/studio/studioContext';
import { MAX_IMAGE_BYTES } from '@/modules/workspace/domain/imageUpload';
import { EmptyState } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { Icon, IconGlyph } from '@/shared/ui/Icon';
import { useRef, useState, type ReactNode } from 'react';

const PREVIEW_DATE = '2026-01-01T00:00:00.000Z';

/** Draggable tile: click adds at the canvas centre, drag drops at the pointer. */
function PresetTile({
  preset,
  className,
  children,
}: {
  preset: Preset;
  className: string;
  children: ReactNode;
}) {
  const { insert } = useStudioActions();
  return (
    <button
      type="button"
      className={className}
      draggable
      aria-label={`Add ${preset.label.toLowerCase()}`}
      data-tooltip={`${preset.label} — click to add, or drag onto the canvas`}
      onDragStart={(event) => {
        event.dataTransfer.setData(PRESET_MIME, preset.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        insert(preset.build);
      }}
    >
      {children}
    </button>
  );
}

/** Renders a preset's element on its own, for the tile preview. */
function PresetPreview({ preset, size }: { preset: Preset; size: number }) {
  const element = preset.build(`preview-${preset.id}`);
  const padding = element.type === 'line' ? 8 : 0;
  const document = createDocument({
    id: `preview-${preset.id}`,
    name: preset.label,
    category: 'blank',
    format: {
      id: 'preview',
      width: Math.ceil(element.width + padding * 2),
      height: Math.ceil(element.height + padding * 2),
    },
    background: { kind: 'none' },
    elements: [{ ...element, x: padding, y: padding }],
    now: PREVIEW_DATE,
  });
  return (
    <DesignSvg
      document={document}
      assetUrls={{}}
      width={size}
      height={size}
      className="preset-preview"
    />
  );
}

function TextTab() {
  return (
    <div className="insert-section">
      <h3 className="insert-heading">Text styles</h3>
      <div className="text-preset-list">
        {TEXT_PRESETS.map((preset) => (
          <PresetTile
            key={preset.id}
            preset={preset}
            className={`text-preset text-preset--${preset.id}`}
          >
            {preset.label}
          </PresetTile>
        ))}
      </div>
      <h3 className="insert-heading">Font combinations</h3>
      <div className="combo-grid">
        {TEXT_COMBOS.map((preset) => (
          <PresetTile key={preset.id} preset={preset} className="combo-tile">
            <PresetPreview preset={preset} size={120} />
            <span className="combo-tile__label">{preset.label}</span>
          </PresetTile>
        ))}
      </div>
    </div>
  );
}

function ShapesTab() {
  return (
    <div className="insert-section">
      <h3 className="insert-heading">Basic shapes</h3>
      <div className="tile-grid">
        {SHAPE_PRESETS.map((preset) => (
          <PresetTile key={preset.id} preset={preset} className="tile">
            <PresetPreview preset={preset} size={44} />
            <span className="tile__label">{preset.label}</span>
          </PresetTile>
        ))}
      </div>
      <h3 className="insert-heading">Styled</h3>
      <div className="tile-grid">
        {EXTRA_SHAPE_PRESETS.map((preset) => (
          <PresetTile key={preset.id} preset={preset} className="tile">
            <PresetPreview preset={preset} size={44} />
            <span className="tile__label">{preset.label}</span>
          </PresetTile>
        ))}
      </div>
      <h3 className="insert-heading">Lines & arrows</h3>
      <div className="tile-grid">
        {LINE_PRESETS.map((preset) => (
          <PresetTile key={preset.id} preset={preset} className="tile">
            <PresetPreview preset={preset} size={44} />
            <span className="tile__label">{preset.label}</span>
          </PresetTile>
        ))}
      </div>
    </div>
  );
}

function IconsTab() {
  const [term, setTerm] = useState('');
  const results = searchIcons(term);
  return (
    <div className="insert-section">
      <TextField
        label="Search icons"
        hideLabel
        icon="search"
        type="search"
        placeholder={`Search ${ICON_CATALOG.length} icons`}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
        }}
      />
      {results.length === 0 && (
        <EmptyState icon="search" title="No icons found">
          Try “party”, “date” or “award”.
        </EmptyState>
      )}
      {ICON_GROUPS.map((group) => {
        const icons = results.filter((icon) => icon.group === group);
        return icons.length === 0 ? null : (
          <section key={group}>
            <h3 className="insert-heading">{group}</h3>
            <div className="icon-grid">
              {icons.map((icon) => (
                <PresetTile
                  key={icon.id}
                  preset={iconPreset(icon.id, icon.label)}
                  className="icon-tile"
                >
                  <IconGlyph node={icon.node} size={22} />
                </PresetTile>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function UploadsTab() {
  const assets = useWorkspaceState((state) => state.assets);
  const persistent = useWorkspaceState((state) => state.persistent);
  const format = useStudio((state) => state.history.present.format);
  const { insert } = useStudioActions();
  const { upload, pending } = useImageUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="insert-section">
      <button
        type="button"
        className="dropzone"
        aria-busy={pending > 0 || undefined}
        onClick={() => {
          inputRef.current?.click();
        }}
      >
        {pending > 0 ? (
          <Icon name="spinner" className="spin" size={22} />
        ) : (
          <Icon name="image-plus" size={22} />
        )}
        <strong>
          {pending > 0 ? `Processing ${pending}…` : 'Upload images'}
        </strong>
        <span>
          PNG, JPEG, GIF or WebP up to {MAX_IMAGE_BYTES / 1024 / 1024} MB. Or
          drop files onto the canvas.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void upload(files, { place: true });
        }}
      />
      <p className="insert-note">
        <Icon name="shield" size={13} />
        {persistent
          ? 'Images are encrypted and stored in this browser with your designs.'
          : 'Sandbox: images are kept in this tab only.'}
      </p>
      {assets.length > 0 && (
        <>
          <h3 className="insert-heading">Your images</h3>
          <div className="upload-grid">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="upload-tile"
                aria-label={`Add ${asset.name}`}
                data-tooltip={`${asset.name} · ${asset.width}×${asset.height}`}
                onClick={() => {
                  insert((id) => createImage(id, asset, format));
                }}
              >
                <AssetThumb assetId={asset.id} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AssetThumb({ assetId }: { assetId: string }) {
  const document = createDocument({
    id: `thumb-${assetId}`,
    name: 'thumb',
    category: 'blank',
    format: { id: 'thumb', width: 96, height: 96 },
    background: { kind: 'none' },
    elements: [
      {
        id: 'image',
        name: '',
        type: 'image',
        assetId,
        x: 0,
        y: 0,
        width: 96,
        height: 96,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        fit: 'cover',
        cornerRadius: 8,
        stroke: null,
      },
    ],
    now: PREVIEW_DATE,
  });
  return <AssetThumbImage document={document} />;
}

function AssetThumbImage({
  document,
}: {
  document: ReturnType<typeof createDocument>;
}) {
  const urls = useAssetUrls(document);
  return (
    <DesignSvg document={document} assetUrls={urls} className="fluid-svg" />
  );
}

function FillSwatch({ fill }: { fill: Fill }) {
  const vector = fill.kind === 'linear' ? gradientVector(fill.angle) : null;
  const id = `swatch-${fill.kind === 'linear' ? `${fill.from}${fill.to}`.replace(/#/g, '') : 'solid'}`;
  return (
    <svg
      viewBox="0 0 1 1"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {fill.kind === 'linear' && vector && (
        <defs>
          <linearGradient id={id} {...vector}>
            <stop offset="0" stopColor={fill.from} />
            <stop offset="1" stopColor={fill.to} />
          </linearGradient>
        </defs>
      )}
      <rect width="1" height="1" fill={fillPaint(fill, id)} />
    </svg>
  );
}

function BackgroundTab() {
  const background = useStudio((state) => state.history.present.background);
  const { updateDocument } = useStudioActions();
  return (
    <div className="insert-section">
      <h3 className="insert-heading">Page background</h3>
      <div className="background-grid">
        {BACKGROUND_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="background-tile"
            aria-label={`${preset.label} background`}
            aria-pressed={
              JSON.stringify(background) === JSON.stringify(preset.fill)
            }
            onClick={() => {
              updateDocument({ background: preset.fill });
            }}
          >
            <FillSwatch fill={preset.fill} />
            <span className="background-tile__label">{preset.label}</span>
          </button>
        ))}
      </div>
      <p className="insert-note">
        <Icon name="info" size={13} /> Fine-tune colours and gradient angle in
        the Design panel with nothing selected.
      </p>
    </div>
  );
}

const TITLES: Record<InsertTab, string> = {
  text: 'Text',
  shapes: 'Shapes & lines',
  icons: 'Icons',
  uploads: 'Uploads',
  background: 'Background',
};

function TabBody({ tab }: { tab: InsertTab }) {
  switch (tab) {
    case 'text':
      return <TextTab />;
    case 'shapes':
      return <ShapesTab />;
    case 'icons':
      return <IconsTab />;
    case 'uploads':
      return <UploadsTab />;
    case 'background':
      return <BackgroundTab />;
  }
}

export function InsertPanel({ tab }: { tab: InsertTab }) {
  return (
    <section
      className="insert-panel"
      aria-label={TITLES[tab]}
      id="insert-panel"
    >
      <h2 className="panel-title">{TITLES[tab]}</h2>
      <TabBody tab={tab} />
    </section>
  );
}
