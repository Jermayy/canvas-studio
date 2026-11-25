import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';

/**
 * Form controls with labels, hints and inline errors wired for screen
 * readers. Numeric and colour inputs keep a local draft only while the user
 * is typing ("draft is null until edited") and commit on Enter or blur.
 */

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id'
> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  icon?: UiIconName;
  trailing?: ReactNode;
  hideLabel?: boolean;
  /** Forwarded to the input (React 19 passes refs as props). */
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  icon,
  trailing,
  hideLabel = false,
  className,
  ...input
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={`field${error ? ' field--invalid' : ''}${className ? ` ${className}` : ''}`}
    >
      <label
        htmlFor={id}
        className={hideLabel ? 'visually-hidden' : 'field__label'}
      >
        {label}
      </label>
      <div className="field__control">
        {icon && <Icon name={icon} className="field__icon" size={16} />}
        <input
          {...input}
          id={id}
          className={`input${icon ? ' input--with-icon' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function NumberField({
  label,
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  disabled,
  compact = true,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const parsed = Number(shown);
  const invalid =
    draft !== null && (shown.trim() === '' || !Number.isFinite(parsed));

  const commit = (next: number) => {
    setDraft(null);
    const clamped = clamp(Math.round(next * 100) / 100, min, max);
    if (clamped !== value) {
      onCommit(clamped);
    }
  };

  return (
    <div className={`number-field${compact ? ' number-field--compact' : ''}`}>
      <label htmlFor={id} className="number-field__label">
        {label}
      </label>
      <div className="number-field__control">
        <input
          id={id}
          className="input input--number"
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            if (invalid) {
              setDraft(null);
            } else if (draft !== null) {
              commit(parsed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !invalid) {
              commit(parsed);
            } else if (event.key === 'Escape') {
              setDraft(null);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const direction = event.key === 'ArrowUp' ? 1 : -1;
              const base = Number.isFinite(parsed) ? parsed : value;
              commit(base + direction * step * (event.shiftKey ? 10 : 1));
            }
          }}
        />
        {suffix && <span className="number-field__suffix">{suffix}</span>}
      </div>
    </div>
  );
}

const HEX = /^#?[0-9a-f]{6}$/i;

export function ColorField({
  label,
  value,
  onCommit,
  swatches = [],
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  swatches?: readonly string[];
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.toUpperCase();
  const valid = HEX.test(shown);

  const commit = (next: string) => {
    setDraft(null);
    const normalised = (next.startsWith('#') ? next : `#${next}`).toLowerCase();
    if (HEX.test(normalised) && normalised !== value.toLowerCase()) {
      onCommit(normalised);
    }
  };

  return (
    <div className="color-field">
      <span className="color-field__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="color-field__row">
        <input
          type="color"
          className="color-field__picker"
          value={value}
          aria-labelledby={`${id}-label`}
          onChange={(event) => {
            commit(event.target.value);
          }}
        />
        <input
          className="input input--hex"
          value={shown}
          aria-label={`${label} hex value`}
          aria-invalid={!valid || undefined}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            if (valid) {
              commit(shown);
            } else {
              setDraft(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) {
              commit(shown);
            }
          }}
        />
      </div>
      {swatches.length > 0 && (
        <div className="swatches" role="group" aria-label={`${label} swatches`}>
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`swatch${swatch.toLowerCase() === value.toLowerCase() ? ' swatch--active' : ''}`}
              style={{ background: swatch }}
              aria-label={swatch.toUpperCase()}
              aria-pressed={swatch.toLowerCase() === value.toLowerCase()}
              onClick={() => {
                commit(swatch);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="field field--select">
      <label
        htmlFor={id}
        className={hideLabel ? 'visually-hidden' : 'field__label'}
      >
        {label}
      </label>
      <div className="select">
        <select
          id={id}
          className="input select__input"
          value={value}
          onChange={(event) => {
            const next = options.find(
              (option) => option.value === event.target.value,
            );
            if (next) {
              onChange(next.value);
            }
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={15} className="select__chevron" />
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const finish = () => {
    if (draft !== null) {
      setDraft(null);
      onCommit(draft);
    }
  };
  return (
    <div className="slider">
      <div className="slider__header">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(shown)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDraft(next);
          onChange?.(next);
        }}
        onPointerUp={finish}
        onKeyUp={finish}
        onBlur={finish}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="toggle">
      <div className="toggle__text">
        <span id={`${id}-label`} className="toggle__label">
          {label}
        </span>
        {description && (
          <span id={`${id}-description`} className="toggle__description">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        className="toggle__switch"
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="toggle__thumb" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: UiIconName }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="segmented-field">
      <span id={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            aria-label={option.icon ? option.label : undefined}
            data-tooltip={option.icon ? option.label : undefined}
            className={`segmented__option${option.value === value ? ' segmented__option--active' : ''}`}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.icon ? <Icon name={option.icon} size={16} /> : option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
