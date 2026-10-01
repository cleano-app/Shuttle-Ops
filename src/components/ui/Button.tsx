import type { ButtonHTMLAttributes } from "react";
import { buttonClasses, type ButtonVariant } from "./classes";

/** Cleano Ops's Button: full-width 10px-radius action, navy primary. */
export function Button({
  variant = "primary",
  fullWidth = true,
  className = "",
  children,
  ...props
}: {
  variant?: ButtonVariant;
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${buttonClasses(variant, fullWidth)} ${className}`} {...props}>
      {children}
    </button>
  );
}
