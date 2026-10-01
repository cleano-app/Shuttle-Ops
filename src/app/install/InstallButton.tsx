"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/classes";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` when the app can be
 * installed; we hold on to it and show a real Install button. Safari never
 * fires it, so iPhone users follow the written steps instead.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedNow, setInstalled] = useState(false);
  // Already running as the installed app (opened from the home screen).
  const standalone = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false
  );
  const installed = installedNow || standalone;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <p className="rounded-lg bg-green-bg p-3 text-sm text-green">Shuttle Ops is installed on this device.</p>;
  }
  if (!prompt) return null;

  return (
    <button
      type="button"
      className={buttonClasses("primary")}
      onClick={async () => {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") setInstalled(true);
        setPrompt(null);
      }}
    >
      Install Shuttle Ops
    </button>
  );
}
