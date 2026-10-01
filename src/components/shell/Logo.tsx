// Placeholder mark until a real logo exists: a white "S" on a navy rounded
// square (same artwork as public/icon.svg), plus the wordmark. Drawn in
// place of Cleano's AppBarLogo / sidebar lockup at the same sizes.

export function LogoMark({ className = "h-7 w-7 rounded-[8px] text-[16px]" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-navy font-bold leading-none text-white ${className}`}
    >
      <span className="text-[0.95em]">S</span>
    </span>
  );
}

export function Logo({
  name = "Shuttle Ops",
  size = "sm",
}: {
  name?: string;
  size?: "sm" | "lg";
}) {
  if (size === "lg") {
    return (
      <span className="flex items-center gap-3">
        <LogoMark className="h-11 w-11 rounded-[12px] text-[24px]" />
        <span className="text-[22px] font-bold tracking-tight text-navy">{name}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <LogoMark className="h-7 w-7 rounded-[8px] text-[16px]" />
      <span className="truncate text-[15px] font-bold tracking-tight text-navy">{name}</span>
    </span>
  );
}
