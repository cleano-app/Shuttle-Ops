import { Logo } from "./Logo";

/**
 * Sign-in / password screens (Cleano Ops's login look): the brand lockup
 * centred above a white card on the page background.
 */
export function AuthCard({
  brandName,
  children,
}: {
  brandName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 py-10">
      <div className="mb-6">
        <Logo size="lg" name={brandName} />
      </div>
      <div className="w-full max-w-sm rounded-card border border-hairline bg-white p-8 shadow-card">{children}</div>
    </div>
  );
}
