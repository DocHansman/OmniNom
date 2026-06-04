import { useState, useEffect } from "react";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");

  useEffect(() => {
    // Check if app is already running in standalone mode (installed)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                         (window.navigator as any).standalone === true;

    if (isStandalone) return () => {};

    // Check if dismissed previously
    const isDismissed = localStorage.getItem("omninom_install_dismissed") === "true";
    if (isDismissed) return () => {};

    // Detect user platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);

    if (isIos) {
      setPlatform("ios");
      // Delayed display for iOS custom help (after 30 seconds)
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 30000);
      return () => clearTimeout(timer);
    } else {
      setPlatform("android");
      
      const handleInstallPrompt = (e: Event) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        // Delayed display (after 30 seconds)
        setTimeout(() => {
          setShowPrompt(true);
        }, 30000);
      };

      window.addEventListener("beforeinstallprompt", handleInstallPrompt);
      return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    }
  }, []);

  const handleInstallClick = async () => {
    if (platform === "android" && deferredPrompt) {
      // Show native install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install prompt result: ${outcome}`);
      
      // Clear stashed event
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("omninom_install_dismissed", "true");
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-6 md:right-auto max-w-sm rounded-2xl border border-primary bg-surface p-5 shadow-xl z-40 animate-slide-up flex gap-4">
      {/* Icon */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary">
        <Download size={24} />
      </div>

      {/* Details */}
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between">
          <h4 className="text-sm font-extrabold text-on-surface uppercase tracking-wider">App installieren</h4>
          <button onClick={handleDismiss} className="p-1.5 rounded-xl hover:bg-muted text-on-surface-muted cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {platform === "ios" ? (
          <p className="text-xs leading-relaxed text-on-surface-muted font-medium">
            Um diese Koch-App auf Deinem iPhone zu installieren, tippe in Safari unten auf das 
            <strong className="inline-flex items-center gap-0.5 font-bold mx-0.5 text-primary">
              Teilen-Symbol <Share size={14} />
            </strong> 
            und wähle <strong>„Zum Home-Bildschirm“</strong>.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-on-surface-muted font-medium">
              Installiere OmniNom auf Deinem Startbildschirm, um schnellen Zugriff und vollen Offline-Support zu erhalten.
            </p>
            <button
              onClick={handleInstallClick}
              className="h-11 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-extrabold text-white hover:bg-primary-hover shadow-sm transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Jetzt installieren</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
