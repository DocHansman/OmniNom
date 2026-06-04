import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";

interface AiScanOverlayProps {
  onCancel: () => void;
}

const ROTATING_MESSAGES = [
  "Bild wird analysiert...",
  "Erkenne Text & Struktur...",
  "Lese Zutatenliste...",
  "Klassifiziere Mengen & Einheiten...",
  "Extrahiere Kochschritte...",
  "Berechne Nährwertangaben...",
  "Schlage passende Tags vor...",
  "Fast fertig..."
];

export default function AiScanOverlay({ onCancel }: AiScanOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Rotate messages every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ROTATING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4 text-center text-white backdrop-blur-sm animate-scale-in">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col items-center gap-6">
        
        {/* Loading Spinner */}
        <div className="relative flex items-center justify-center">
          <Loader2 className="h-16 w-16 animate-spin text-primary" strokeWidth={1.5} />
          <span className="absolute text-xl">🤖</span>
        </div>

        {/* Text descriptions */}
        <div className="space-y-1 text-center">
          <h3 className="text-base font-bold text-on-surface">AI Foto-Scan aktiv</h3>
          <p className="text-xs text-on-surface-muted h-8 flex items-center justify-center font-medium px-2">
            {ROTATING_MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted active:scale-95 transition-all cursor-pointer w-full text-on-surface"
        >
          <X size={14} />
          <span>Abbrechen</span>
        </button>
      </div>
    </div>
  );
}
