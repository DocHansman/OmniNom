import { useEffect, useState } from "react";
import { AlertTriangle, Server, User } from "lucide-react";
import { useAuth } from "../App";
import { decrypt } from "../crypto/cryptoEngine";
import Loader from "./Loader";

export interface ConflictState {
  mine: any;
  theirs: any;
  entityType: "recipe" | "meal_plan" | "inventory" | "shopping_list";
}

interface ConflictResolutionModalProps {
  conflict: ConflictState;
  onResolve: (choice: "mine" | "theirs") => Promise<void>;
}

export default function ConflictResolutionModal({ conflict, onResolve }: ConflictResolutionModalProps) {
  const { cryptoKey } = useAuth();
  const [itemName, setItemName] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    async function loadConflictName() {
      if (!cryptoKey) return;
      setIsDecrypting(true);
      try {
        if (conflict.entityType === "recipe" && conflict.mine?.encrypted_payload) {
          const payloadStr = await decrypt(cryptoKey, conflict.mine.encrypted_payload);
          const payload = JSON.parse(payloadStr);
          setItemName(payload.title || "Unbenanntes Rezept");
        } else if (conflict.entityType === "shopping_list" && conflict.mine?.encrypted_payload) {
          const payloadStr = await decrypt(cryptoKey, conflict.mine.encrypted_payload);
          const payload = JSON.parse(payloadStr);
          setItemName(payload.name || "Einkaufszettel-Artikel");
        } else if (conflict.entityType === "meal_plan") {
          setItemName("Wochenplan-Eintrag");
        } else if (conflict.entityType === "inventory") {
          setItemName("Vorratsliste");
        } else {
          setItemName("Element");
        }
      } catch (e) {
        console.error("Failed to decrypt conflict payload", e);
        setItemName("Verschlüsseltes Element");
      } finally {
        setIsDecrypting(false);
      }
    }
    loadConflictName();
  }, [conflict, cryptoKey]);

  const handleChoice = async (choice: "mine" | "theirs") => {
    setIsProcessing(true);
    try {
      await onResolve(choice);
    } finally {
      setIsProcessing(false);
    }
  };

  const getEntityTypeName = () => {
    switch (conflict.entityType) {
      case "recipe": return "Rezept";
      case "meal_plan": return "Wochenplan-Eintrag";
      case "inventory": return "Vorratkammer";
      case "shopping_list": return "Einkaufsliste";
      default: return "Daten-Element";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-scale-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col gap-4">
        
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border pb-3">
          <div className="p-2 rounded-full bg-error/15 text-error shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-on-surface">Sync-Konflikt erkannt</h3>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Für ein(e) {getEntityTypeName()} wurden zeitgleiche Änderungen auf einem anderen Gerät gefunden.
            </p>
          </div>
        </div>

        {/* Conflict Details */}
        <div className="rounded-xl bg-muted/30 border border-border/50 p-4 text-xs space-y-2">
          <div className="flex justify-between font-bold">
            <span className="text-on-surface-muted">Betroffenes Element:</span>
            {isDecrypting ? (
              <span className="flex items-center gap-1"><Loader className="h-3 w-3" /> Entschlüsseln...</span>
            ) : (
              <span className="text-on-surface">{itemName}</span>
            )}
          </div>
          <p className="text-[10px] text-on-surface-muted leading-relaxed">
            Bitte wähle, welche Version der Daten du behalten möchtest. Die andere Version wird unwiderruflich überschrieben.
          </p>
        </div>

        {/* Choice buttons */}
        <div className="flex flex-col gap-2 pt-2">
          {/* Option A: Local Version */}
          <button
            onClick={() => handleChoice("mine")}
            disabled={isProcessing}
            className="flex items-center justify-between rounded-xl border border-border bg-surface hover:bg-muted/40 p-4 text-left transition-all active:scale-99 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary-light/65 text-primary mt-0.5">
                <User size={16} />
              </div>
              <div>
                <span className="text-xs font-extrabold block">Meine Version behalten</span>
                <span className="text-[10px] text-on-surface-muted font-bold block mt-0.5">
                  Überschreibt die Serverdaten mit dem lokalen Stand dieses Geräts.
                </span>
              </div>
            </div>
          </button>

          {/* Option B: Server Version */}
          <button
            onClick={() => handleChoice("theirs")}
            disabled={isProcessing}
            className="flex items-center justify-between rounded-xl border border-border bg-surface hover:bg-muted/40 p-4 text-left transition-all active:scale-99 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-secondary/10 text-secondary mt-0.5">
                <Server size={16} />
              </div>
              <div>
                <span className="text-xs font-extrabold block">Server-Version übernehmen</span>
                <span className="text-[10px] text-on-surface-muted font-bold block mt-0.5">
                  Verwirft die lokalen Änderungen und lädt den aktuellen Stand des Servers.
                </span>
              </div>
            </div>
          </button>
        </div>

        {isProcessing && (
          <div className="flex justify-center items-center gap-1.5 text-xs text-on-surface-muted font-bold pt-2">
            <Loader className="h-3.5 w-3.5" /> Konflikt wird aufgelöst...
          </div>
        )}
      </div>
    </div>
  );
}
