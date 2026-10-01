import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts live IN THIS REPOSITORY (copied from Cleano Ops's src/fonts), not
// fetched from Google at build time: Cleano lost two production builds to
// next/font/google download failures, and a build that needs nothing but
// the repo can't fail that way. Poppins, latin subset, same as Cleano.
// Hebrew/Yiddish glyphs in the portal fall back to the system font.
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "../fonts/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const DESCRIPTION = "Booking, dispatch and charitable subsidy management for the London ⇄ Antwerp shuttle.";

export const metadata: Metadata = {
  title: "Shuttle Ops",
  description: DESCRIPTION,
  openGraph: { title: "Shuttle Ops", description: DESCRIPTION, type: "website" },
  twitter: { card: "summary", title: "Shuttle Ops", description: DESCRIPTION },
  icons: { icon: "/icon.svg" },
  // iOS ignores the web manifest for home-screen installs and reads these
  // instead (same as Cleano).
  appleWebApp: { capable: true, title: "Shuttle Ops", statusBarStyle: "default" },
};

// themeColor belongs on viewport, not metadata. Tints the phone status bar
// and app-switcher card navy once installed. viewportFit "cover" makes
// env(safe-area-inset-*) real so the bottom tab bar clears the home
// indicator on notched phones.
export const viewport: Viewport = {
  themeColor: "#2a1f5c",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      // en-GB so <input type="date"> etc. show UK formats (same as Cleano).
      lang="en-GB"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Keyboard-visible only (see .skip-link in globals.css) - jumps
            past the header/nav straight to each role layout's <main
            id="main-content">. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
