import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, AlertCircle } from "lucide-react";

interface ScannedIngredient {
  tempId: string;
  checked: boolean;
  name: string;
  amount: number;
  unit: string;
  category: string;
  isEstimate: boolean;
}

interface InventoryScanReviewProps {
  isOpen: boolean;
  onClose: () => void;
  initialIngredients: Array<{ name: string; amount: number; unit: string; category: string; isEstimate: boolean }>;
  onSave: (items: Array<{ name: string; amount: number; unit: string; category: string; isEstimate: boolean }>) => Promise<void>;
}

const INVENTORY_CATEGORIES = [
  "Kühlschrank",
  "Konserven",
  "Trocken",
  "Gewürze",
  "Frische Kräuter",
  "Tiefkühl",
  "Sonstiges"
];

const AVAILABLE_UNITS = ["g", "kg", "ml", "l", "TL", "EL", "Tasse", "Stück", "Prise", "Dose", "Flasche", "Bund"];

export default function InventoryScanReview({ isOpen, onClose, initialIngredients, onSave }: InventoryScanReviewProps) {
  const [items, setItems] = useState<ScannedIngredient[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setItems(
        initialIngredients.map((ing) => ({
          tempId: Math.random().toString(36).substring(2, 9),
          checked: true,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit || "Stück",
          category: ing.category || "Sonstiges",
          isEstimate: ing.isEstimate || false
        }))
      );
    }
  }, [isOpen, initialIngredients]);

  if (!isOpen) return null;

  const handleToggleCheck = (tempId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleFieldChange = (tempId: string, field: keyof ScannedIngredient, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (tempId: string) => {
    setItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(36).substring(2, 9),
        checked: true,
        name: "",
        amount: 1,
        unit: "Stück",
        category: "Sonstiges",
        isEstimate: false
      }
    ]);
  };

  const handleSave = async () => {
    const selectedItems = items.filter((i) => i.checked && i.name.trim().length > 0 && i.amount > 0);
    if (selectedItems.length === 0) {
      const event = new CustomEvent("show-toast", {
        detail: { msg: "Bitte wähle mindestens ein gültiges Element aus.", type: "error" }
      });
      window.dispatchEvent(event);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(
        selectedItems.map((i) => ({
          name: i.name.trim(),
          amount: i.amount,
          unit: i.unit,
          category: i.category,
          isEstimate: i.isEstimate
        }))
      );
      onClose();
    } catch (e) {
      console.error(e);
      const event = new CustomEvent("show-toast", {
        detail: { msg: "Fehler beim Speichern der Vorräte.", type: "error" }
      });
      window.dispatchEvent(event);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-scale-in">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div>
            <h3 className="text-base font-extrabold text-on-surface">Erkannte Vorräte überprüfen</h3>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Überprüfe und korrigiere die extrahierten Zutatendaten, bevor sie im Vorrat gespeichert werden.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-on-surface-muted">
              <AlertCircle size={24} />
              <p className="text-xs font-semibold">Keine Zutaten erkannt oder hinzugefügt.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-muted">
                <div className="col-span-1 text-center">Aktiv</div>
                <div className="col-span-2">Menge</div>
                <div className="col-span-2">Einheit</div>
                <div className="col-span-4">Name (ohne Marke)</div>
                <div className="col-span-2">Kategorie</div>
                <div className="col-span-1 text-center">Schätz.</div>
              </div>

              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.tempId}
                    className={`flex flex-col sm:grid sm:grid-cols-12 gap-2 items-center border rounded-xl p-3 sm:p-2.5 transition-colors ${
                      item.checked ? "bg-surface border-border" : "bg-muted/10 border-border/40 opacity-60"
                    }`}
                  >
                    {/* Active Checkbox */}
                    <div className="col-span-1 flex justify-center items-center w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(item.tempId)}
                        className={`h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                          item.checked
                            ? "bg-primary border-primary text-white"
                            : "border-border bg-background"
                        }`}
                      >
                        {item.checked && <Check size={12} strokeWidth={4} />}
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="col-span-2 w-full">
                      <label className="text-[10px] font-bold text-on-surface-muted uppercase sm:hidden mb-1 block">Menge</label>
                      <input
                        type="number"
                        step="any"
                        disabled={!item.checked}
                        value={item.amount || ""}
                        onChange={(e) => handleFieldChange(item.tempId, "amount", parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-border bg-background p-1.5 text-center text-xs font-semibold focus:outline-none"
                      />
                    </div>

                    {/* Unit Select */}
                    <div className="col-span-2 w-full">
                      <label className="text-[10px] font-bold text-on-surface-muted uppercase sm:hidden mb-1 block">Einheit</label>
                      <select
                        disabled={!item.checked}
                        value={item.unit}
                        onChange={(e) => handleFieldChange(item.tempId, "unit", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background p-1.5 text-xs font-semibold focus:outline-none"
                      >
                        {AVAILABLE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Name Input */}
                    <div className="col-span-4 w-full">
                      <label className="text-[10px] font-bold text-on-surface-muted uppercase sm:hidden mb-1 block">Name</label>
                      <input
                        type="text"
                        disabled={!item.checked}
                        value={item.name}
                        onChange={(e) => handleFieldChange(item.tempId, "name", e.target.value)}
                        placeholder="Zutatenname"
                        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
                      />
                    </div>

                    {/* Category Select */}
                    <div className="col-span-2 w-full">
                      <label className="text-[10px] font-bold text-on-surface-muted uppercase sm:hidden mb-1 block">Kategorie</label>
                      <select
                        disabled={!item.checked}
                        value={item.category}
                        onChange={(e) => handleFieldChange(item.tempId, "category", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background p-1.5 text-xs font-semibold focus:outline-none"
                      >
                        {INVENTORY_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Estimate Checkbox & Delete */}
                    <div className="col-span-1 flex items-center justify-around w-full sm:w-auto gap-2 pt-2 sm:pt-0">
                      <div className="flex items-center gap-1.5 sm:justify-center">
                        <label className="text-[10px] font-bold text-on-surface-muted uppercase sm:hidden">Schätzung (~)</label>
                        <input
                          type="checkbox"
                          disabled={!item.checked}
                          checked={item.isEstimate}
                          onChange={(e) => handleFieldChange(item.tempId, "isEstimate", e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.tempId)}
                        className="p-1 rounded-lg text-on-surface-muted hover:text-error hover:bg-error/5 cursor-pointer"
                        title="Zutat löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1 text-xs font-extrabold text-primary hover:text-primary-hover transition-colors py-1 cursor-pointer"
          >
            <Plus size={14} />
            <span>Zutat manuell hinzufügen</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border bg-muted/10 flex justify-end gap-3 text-xs font-bold">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border bg-background text-on-surface-muted hover:bg-muted cursor-pointer transition-colors active:scale-95"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            {isSaving ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Check size={14} strokeWidth={3} />
            )}
            <span>Vorrat aktualisieren</span>
          </button>
        </div>

      </div>
    </div>
  );
}
