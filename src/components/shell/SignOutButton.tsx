"use client";

import { Icon } from "./icons";

/**
 * The red "Sign out" row used at the foot of the menu sheet and sidebar
 * (Cleano style). `confirmMessage` asks first, as Cleano does for staff;
 * leave it out to sign straight out.
 */
export function SignOutButton({
  action,
  label = "Sign out",
  confirmMessage,
  variant = "sheet",
}: {
  action: () => void | Promise<void>;
  label?: string;
  confirmMessage?: string;
  variant?: "sheet" | "sidebar";
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className={
          variant === "sheet"
            ? "flex min-h-[54px] w-full items-center gap-3.5 px-5 text-start text-[16px] font-medium text-red active:bg-press"
            : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium text-red hover:bg-press"
        }
      >
        <Icon name="sign-out" className={`shrink-0 rtl:-scale-x-100 ${variant === "sheet" ? "h-5 w-5" : "h-4 w-4"}`} />
        {label}
      </button>
    </form>
  );
}
