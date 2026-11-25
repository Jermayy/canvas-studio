import { usePreferences } from '@/app/services';
import { ACCENTS, type Preferences } from '@/modules/preferences/preferences';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Segmented, Toggle } from '@/shared/ui/fields';

/** Interface customisation; every change applies live. */
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { preferences, update, reset } = usePreferences();
  const set =
    <K extends keyof Preferences>(key: K) =>
    (value: Preferences[K]) => {
      update({ [key]: value });
    };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Appearance & editor"
      description="Changes apply instantly and are remembered in this browser."
      footer={
        <>
          <Button variant="ghost" onClick={reset}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <section
        className="settings-section"
        aria-labelledby="settings-appearance"
      >
        <h3 id="settings-appearance" className="settings-section__title">
          Appearance
        </h3>
        <Segmented
          label="Theme"
          value={preferences.theme}
          onChange={set('theme')}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <div className="segmented-field">
          <span className="field__label" id="accent-label">
            Accent colour
          </span>
          <div
            className="accent-picker"
            role="radiogroup"
            aria-labelledby="accent-label"
          >
            {ACCENTS.map((accent) => (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={preferences.accent === accent.id}
                aria-label={accent.label}
                data-tooltip={accent.label}
                className="accent-picker__option"
                style={{ background: accent.swatch }}
                onClick={() => {
                  update({ accent: accent.id });
                }}
              />
            ))}
          </div>
        </div>
        <Segmented
          label="Density"
          value={preferences.density}
          onChange={set('density')}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
        <Segmented
          label="Interface size"
          value={preferences.uiScale}
          onChange={set('uiScale')}
          options={[
            { value: '90', label: 'Small' },
            { value: '100', label: 'Default' },
            { value: '110', label: 'Large' },
          ]}
        />
      </section>
      <section className="settings-section" aria-labelledby="settings-editor">
        <h3 id="settings-editor" className="settings-section__title">
          Editor
        </h3>
        <Segmented
          label="Canvas backdrop"
          value={preferences.canvasBackdrop}
          onChange={set('canvasBackdrop')}
          options={[
            { value: 'dots', label: 'Dots' },
            { value: 'grid', label: 'Grid' },
            { value: 'plain', label: 'Plain' },
          ]}
        />
        <Toggle
          label="Snap to guides"
          description="Align to the canvas and other layers while dragging. Hold Alt to move freely."
          checked={preferences.snapping}
          onChange={set('snapping')}
        />
        <Toggle
          label="Layer hints"
          description="Show what each layer is and its state (locked, hidden) in the Layers panel."
          checked={preferences.layerHints}
          onChange={set('layerHints')}
        />
        <Toggle
          label="Reduce motion"
          description="Turn off animations. Your system setting is always respected."
          checked={preferences.reduceMotion}
          onChange={set('reduceMotion')}
        />
      </section>
    </Dialog>
  );
}
