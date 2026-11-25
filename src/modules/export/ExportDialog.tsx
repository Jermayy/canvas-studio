import { useNotify, useServices } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  checkExportOptions,
  defaultExportOptions,
  effectiveDpi,
  EXPORT_FORMATS,
  EXPORT_SCALES,
  exportFormat,
  maxScale,
  outputSize,
  type ExportFormatId,
  type ExportOptions,
} from '@/modules/export/domain/exportOptions';
import { PHASE_LABELS, useExporter } from '@/modules/export/useExporter';
import { sanitizeFileName } from '@/shared/lib/fileName';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Banner } from '@/shared/ui/feedback';
import { Segmented, Slider, TextField, Toggle } from '@/shared/ui/fields';
import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';
import { useState } from 'react';

const FORMAT_ICONS: Record<ExportFormatId, UiIconName> = {
  pdf: 'file-text',
  png: 'file-image',
  jpeg: 'image',
  svg: 'file-code',
};

/** Format, file name, size and quality, plus a progress readout. */
export function ExportSettings({
  document,
  options,
  onChange,
  formats = EXPORT_FORMATS.map((format) => format.id),
}: {
  document: DesignDocument;
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
  formats?: readonly ExportFormatId[];
}) {
  const format = exportFormat(options.format);
  const check = checkExportOptions(document, options);
  const errors = check.ok ? {} : check.errors;
  const size = outputSize(document, options);
  const largest = maxScale(document);
  return (
    <div className="export-settings">
      <fieldset className="format-picker">
        <legend className="field__label">Format</legend>
        <div className="format-picker__grid">
          {EXPORT_FORMATS.filter((entry) => formats.includes(entry.id)).map(
            (entry) => (
              <label
                key={entry.id}
                className={`format-option${entry.id === options.format ? ' format-option--active' : ''}`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={entry.id}
                  checked={entry.id === options.format}
                  onChange={() => {
                    onChange({ ...options, format: entry.id });
                  }}
                />
                <Icon name={FORMAT_ICONS[entry.id]} size={20} />
                <span className="format-option__name">{entry.label}</span>
                <span className="format-option__description">
                  {entry.description}
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>

      <TextField
        label="File name"
        value={options.fileName}
        maxLength={140}
        error={errors.fileName}
        hint={`Saved as ${check.ok ? check.fileName : `${options.fileName.trim() || '…'}.${format.extension}`}`}
        trailing={<span className="field__suffix">.{format.extension}</span>}
        onChange={(event) => {
          onChange({ ...options, fileName: event.target.value });
        }}
      />

      {!format.vector && (
        <div className="export-settings__row">
          <Segmented
            label="Size"
            value={String(options.scale)}
            options={EXPORT_SCALES.filter((scale) => scale <= largest).map(
              (scale) => ({
                value: String(scale),
                label: `${scale}×`,
              }),
            )}
            onChange={(value) => {
              onChange({
                ...options,
                scale: Number(value) as ExportOptions['scale'],
              });
            }}
          />
          <p className="export-settings__size" aria-live="polite">
            {size.width.toLocaleString()} × {size.height.toLocaleString()} px
            <span> · {effectiveDpi(options.scale)} dpi at print size</span>
          </p>
        </div>
      )}
      {errors.scale && <Banner tone="warning">{errors.scale}</Banner>}
      {format.vector && (
        <p className="inspector-hint">
          Vector: text, shapes and icons stay sharp at any size. Uploaded photos
          are embedded as-is.
        </p>
      )}
      {options.format === 'jpeg' && (
        <Slider
          label="Quality"
          value={Math.round(options.quality * 100)}
          min={50}
          max={100}
          format={(value) => `${value}%`}
          onCommit={(value) => {
            onChange({ ...options, quality: value / 100 });
          }}
        />
      )}
      {format.transparency && (
        <Toggle
          label="Transparent background"
          description="Leave out the page background, e.g. for logos and overlays."
          checked={options.transparent}
          onChange={(transparent) => {
            onChange({ ...options, transparent });
          }}
        />
      )}
      {options.format === 'pdf' && (
        <p className="inspector-hint">
          The PDF page matches your design’s size, with the artwork at{' '}
          {effectiveDpi(options.scale)} dpi.
        </p>
      )}
    </div>
  );
}

export function ExportDialog({
  open,
  onClose,
  document,
}: {
  open: boolean;
  onClose: () => void;
  document: DesignDocument;
}) {
  const { files } = useServices();
  const notify = useNotify();
  const exporter = useExporter();
  const [options, setOptions] = useState<ExportOptions>(() =>
    defaultExportOptions(document, sanitizeFileName(document.name)),
  );
  const [error, setError] = useState<string | null>(null);
  const valid = checkExportOptions(document, options).ok;

  const download = async () => {
    setError(null);
    try {
      const result = await exporter.run(document, options);
      files.download(result.blob, result.fileName);
      notify(
        result.missingAssets > 0
          ? `Downloaded ${result.fileName}. ${result.missingAssets} missing image${result.missingAssets === 1 ? ' was' : 's were'} left out.`
          : `Downloaded ${result.fileName}.`,
        { tone: result.missingAssets > 0 ? 'warning' : 'success' },
      );
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'The export failed.',
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export"
      description="Download a high-quality file of your design."
      size="lg"
      footer={
        <>
          {exporter.phase && (
            <span className="dialog__progress" role="status">
              <Icon name="spinner" className="spin" size={16} />{' '}
              {PHASE_LABELS[exporter.phase]}
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="download"
            busy={exporter.busy}
            busyLabel="Exporting…"
            disabled={!valid}
            onClick={() => {
              void download();
            }}
          >
            Download {exportFormat(options.format).label}
          </Button>
        </>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      <ExportSettings
        document={document}
        options={options}
        onChange={setOptions}
      />
    </Dialog>
  );
}
