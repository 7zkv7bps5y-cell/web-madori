import { useEffect, useState, type ReactNode } from 'react';

export type LengthUnit = 'mm' | 'cm' | 'm';
export const UNIT_FACTOR: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };

export function toUnit(mm: number, unit: LengthUnit): string {
  const v = mm / UNIT_FACTOR[unit];
  return unit === 'm' ? String(Math.round(v * 1000) / 1000) : String(Math.round(v * 10) / 10);
}

/** 入力中は文字列のまま保持し、確定（Enter / フォーカスアウト）時に数値を通知する */
export function NumberField({
  label,
  value,
  onCommit,
  suffix,
  min,
  step = 'any',
  ariaLabel,
}: {
  label?: ReactNode;
  value: string;
  onCommit: (v: number) => void;
  suffix?: string;
  min?: number;
  step?: number | 'any';
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const v = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(v) || (min !== undefined && v < min)) {
      setText(value);
      return;
    }
    if (String(v) !== value) onCommit(v);
  };
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          step={step}
          aria-label={ariaLabel}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  maxLength = 40,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  maxLength?: number;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
