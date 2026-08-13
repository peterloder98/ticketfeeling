"use client";

import { useId, useState, type TextareaHTMLAttributes, type InputHTMLAttributes } from "react";

type CommonProps = {
  label: string;
  maxLength: number;
  hint?: string;
  defaultValue?: string;
  className?: string;
};

type TextareaProps = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "maxLength" | "className"> & {
    as?: "textarea";
    rows?: number;
  };

type InputProps = CommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "maxLength" | "className"> & {
    as: "input";
  };

function Counter({ length, max }: { length: number; max: number }) {
  const over = length >= max;
  return (
    <span
      className={`tabular-nums ${over ? "font-medium text-[var(--tf-navy)]" : "text-[var(--tf-text-secondary)]"}`}
      aria-live="polite"
    >
      {length} / {max}
    </span>
  );
}

export function CharacterCountedField(props: TextareaProps | InputProps) {
  const {
    label,
    maxLength,
    hint,
    defaultValue = "",
    className,
    name,
    id: idProp,
    as = "textarea",
    ...rest
  } = props;
  const autoId = useId();
  const id = idProp ?? autoId;
  const [length, setLength] = useState(() => String(defaultValue).length);

  const labelRow = (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--tf-text-secondary)]">{label}</span>
      <Counter length={length} max={maxLength} />
    </span>
  );

  const onInput = (value: string) => setLength(value.length);

  return (
    <label className={`grid gap-1 text-sm ${className ?? ""}`} htmlFor={id}>
      {labelRow}
      {as === "input" ? (
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          id={id}
          name={name}
          className="tf-input"
          maxLength={maxLength}
          defaultValue={defaultValue}
          onChange={(e) => {
            onInput(e.target.value);
            (rest as InputHTMLAttributes<HTMLInputElement>).onChange?.(e);
          }}
        />
      ) : (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={id}
          name={name}
          className="tf-input"
          rows={(props as TextareaProps).rows ?? 3}
          maxLength={maxLength}
          defaultValue={defaultValue}
          onChange={(e) => {
            onInput(e.target.value);
            (rest as TextareaHTMLAttributes<HTMLTextAreaElement>).onChange?.(e);
          }}
        />
      )}
      {hint ? <span className="text-xs text-[var(--tf-text-secondary)]">{hint}</span> : null}
    </label>
  );
}
