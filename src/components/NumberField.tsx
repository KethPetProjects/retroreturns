import { useEffect, useRef, useState } from 'react';

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  decimal?: boolean;
}

/**
 * A number input that avoids a classic React controlled-input bug: with a
 * plain `<input type="number" value={n} onChange={(e) => setN(Number(e.target.value))}>`,
 * if an in-progress keystroke happens to parse to the same number as before
 * (e.g. typing a leading zero), React sees no prop change and skips updating
 * the DOM — leaving stray characters stuck in the field (reported as editing
 * "1995" and seeing "01996").
 *
 * Fix: keep the literal typed text in local state, independent of the parsed
 * number, and only resync from the external value when it changes for a
 * reason other than the user's own typing (e.g. a Reset button) or on blur,
 * which also canonicalizes away things like a stray leading zero.
 */
export function NumberField({ value, onChange, className, min, max, step, decimal }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={() => {
        isFocused.current = false;
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '' || raw === '-') return; // let the user pause mid-edit without forcing a value
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) {
          onChange(parsed);
        }
      }}
    />
  );
}
