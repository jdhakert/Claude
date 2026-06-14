import { useEffect, useState } from "react";

const DISMISS_KEY = "br_install_dismissed_v1";

/** The (non-standard) install event Chrome/Edge fire before showing install. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Install guidance for the PWA. On Chromium we capture `beforeinstallprompt`
 * and offer a one-tap install; on iOS Safari (which has no such event) we show
 * the manual "Add to Home Screen" steps. Dismissal persists so we don't nag.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (dismissed || isStandalone()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS gives us no event, so offer manual guidance there.
    if (isIos()) setShowIosHint(true);

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [dismissed]);

  if (dismissed || isStandalone()) return null;
  if (!deferred && !showIosHint) return null;

  function dismiss() {
    setDismissed(true);
    if (typeof localStorage !== "undefined")
      localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  return (
    <div className="install-prompt" role="region" aria-label="Install BarReady">
      <div className="install-prompt__body">
        <strong>Install BarReady</strong>
        {deferred ? (
          <p>
            Add BarReady to your home screen for a full-screen, app-like study
            experience.
          </p>
        ) : (
          <p>
            On iPhone/iPad: tap the Share icon, then{" "}
            <strong>Add to Home Screen</strong> to install BarReady.
          </p>
        )}
      </div>
      <div className="install-prompt__actions">
        {deferred && (
          <button type="button" onClick={() => void install()}>
            Install
          </button>
        )}
        <button
          type="button"
          className="install-prompt__dismiss"
          onClick={dismiss}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
