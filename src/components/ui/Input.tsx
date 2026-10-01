import type { InputHTMLAttributes } from "react";
import { INPUT_CLASS, LABEL_CLASS } from "./classes";

/** Cleano Ops's Input: label, input, then one help line or an error. */
export function Input({
  label,
  help,
  error,
  className = "",
  id,
  ...props
}: {
  label?: string;
  help?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      {label && (
        <label htmlFor={inputId} className={LABEL_CLASS}>
          {label}
        </label>
      )}
      <input id={inputId} className={`${INPUT_CLASS} ${className}`} {...props} />
      {help && !error && <p className="mt-1 text-xs text-muted">{help}</p>}
      {error && <p className="mt-1 text-xs text-red">{error}</p>}
    </div>
  );
}
