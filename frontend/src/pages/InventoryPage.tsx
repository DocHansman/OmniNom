import React, { useState, useRef } from "react";
import { 
  Plus, 
  Trash2, 
  Search, 
  Edit2, 
  Check, 
  X, 
  Package, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Minus,
  Camera
} from "lucide-react";
import RecipeSuggester from "../components/RecipeSuggester";
import AiScanOverlay from "../components/AiScanOverlay";
import InventoryScanReview from "../components/InventoryScanReview";

import { useInventory, InventoryItem } from "../hooks/useInventory";
import { formatAmount, SUPPORTED_UNITS } from "../utils/unitConverter";
import { FREQUENT_INGREDIENTS, getIngredientIcon } from "../utils/frequentIngredients";
import { apiFetch } from "../api/apiClient";
import { INVENTORY_CATEGORIES, getInventoryCategory } from "../utils/categorizer";
import Loader from "../components/Loader";

export default function InventoryPage() {
  const { inventoryItems, saveItem, removeItem, isLoading, updateInventory } = useInventory();
  const [isSuggesterOpen, setIsSuggesterOpen] = useState<boolean>(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>("");

  // New Item Form States
  const [newName, setNewName] = useState<string>("");
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newUnit, setNewUnit] = useState<string>("g");
  const [newCategory, setNewCategory] = useState<string>("Sonstiges");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Quick Select Panel State
  const [isFrequentOpen, setIsFrequentOpen] = useState<boolean>(true);

  // AI Scanning States
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannedIngredients, setScannedIngredients] = useState<any[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileScanChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch("/api/inventory/scan", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ingredients && Array.isArray(data.ingredients)) {
          setScannedIngredients(data.ingredients);
          setIsReviewOpen(true);
        } else {
          throw new Error("Ungültiges Antwortformat der KI");
        }
      } else {
        const errText = await response.text();
        const event = new CustomEvent("show-toast", {
          detail: { msg: errText || "Scan fehlerhaft. Bitte erneut versuchen.", type: "error" }
        });
        window.dispatchEvent(event);
      }
    } catch (err) {
      console.error(err);
      const event = new CustomEvent("show-toast", {
        detail: { msg: "Verbindungsfehler beim Vorrats-Scan.", type: "error" }
      });
      window.dispatchEvent(event);
    } finally {
      setIsScanning(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSaveScannedIngredients = async (items: Array<{ name: string; amount: number; unit: string; category: string; isEstimate: boolean }>) => {
    const updatedItems = [...inventoryItems];
    
    items.forEach((newItem) => {
      const existingIdx = updatedItems.findIndex(
        (i) => i.name.toLowerCase().trim() === newItem.name.toLowerCase().trim() &&
               i.unit.toLowerCase().trim() === newItem.unit.toLowerCase().trim()
      );
      
      if (existingIdx !== -1) {
        updatedItems[existingIdx] = {
          ...updatedItems[existingIdx],
          amount: updatedItems[existingIdx].amount + newItem.amount,
          category: newItem.category || updatedItems[existingIdx].category,
          isEstimate: updatedItems[existingIdx].isEstimate || newItem.isEstimate
        };
      } else {
        updatedItems.push({
          id: window.crypto.randomUUID(),
          name: newItem.name,
          amount: newItem.amount,
          unit: newItem.unit,
          category: newItem.category,
          isEstimate: newItem.isEstimate
        });
      }
    });

    await updateInventory(updatedItems);
  };

  const getInventoryItem = (itemName: string) => {
    return inventoryItems.find(
      (item) => item.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    );
  };

  const handleFrequentAdd = async (ing: typeof FREQUENT_INGREDIENTS[0]) => {
    const existing = getInventoryItem(ing.name);
    if (existing) {
      await saveItem({
        id: existing.id,
        name: existing.name,
        amount: existing.amount + ing.defaultAmount,
        unit: existing.unit
      });
    } else {
      await saveItem({
        name: ing.name,
        amount: ing.defaultAmount,
        unit: ing.defaultUnit
      });
    }
  };

  const handleFrequentRemove = async (e: React.MouseEvent, ing: typeof FREQUENT_INGREDIENTS[0]) => {
    e.stopPropagation();
    const existing = getInventoryItem(ing.name);
    if (!existing) return;

    if (existing.amount <= ing.defaultAmount) {
      await removeItem(existing.id);
    } else {
      await saveItem({
        id: existing.id,
        name: existing.name,
        amount: existing.amount - ing.defaultAmount,
        unit: existing.unit
      });
    }
  };

  // Inline Editing States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editUnit, setEditUnit] = useState<string>("g");
  const [editCategory, setEditCategory] = useState<string>("Sonstiges");
  const [editEstimate, setEditEstimate] = useState<boolean>(false);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (newAmount <= 0) {
      const toastEvent = new CustomEvent("show-toast", {
        detail: { msg: "Die Menge muss größer als 0 sein.", type: "error" }
      });
      window.dispatchEvent(toastEvent);
      return;
    }
    
    setIsAdding(true);
    try {
      await saveItem({
        name: newName.trim(),
        amount: newAmount,
        unit: newUnit,
        category: newCategory,
        isEstimate: false
      });
      // Clear form
      setNewName("");
      setNewAmount(0);
      setNewUnit("g");
      setNewCategory("Sonstiges");
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(item.amount);
    setEditUnit(item.unit);
    setEditCategory(item.category || "Sonstiges");
    setEditEstimate(item.isEstimate || false);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    if (editAmount <= 0) {
      const toastEvent = new CustomEvent("show-toast", {
        detail: { msg: "Die Menge muss größer als 0 sein.", type: "error" }
      });
      window.dispatchEvent(toastEvent);
      return;
    }
    try {
      await saveItem({
        id,
        name: editName.trim(),
        amount: editAmount,
        unit: editUnit,
        category: editCategory,
        isEstimate: editEstimate
      });
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const filteredItems = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedInventory = INVENTORY_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = filteredItems.filter(
      (item) => (item.category || "Sonstiges") === cat
    );
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8 space-y-6">
      
      {/* Header title */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Vorratskammer</h2>
          <p className="text-sm text-on-surface-muted">Verwalte deine Haushaltsvorräte zur Einkaufsbedarfsberechnung.</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* KI scanner button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-border hover:bg-muted bg-surface px-4 py-3 text-sm font-extrabold text-on-surface transition-all cursor-pointer shadow-2xs min-h-[48px]"
          >
            <Camera size={16} className="text-on-surface-muted" />
            <span>Vorrat per KI erfassen</span>
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileScanChange}
            accept="image/*,application/pdf"
            className="hidden"
          />

          {/* KI suggestions button */}
          <button
            onClick={() => setIsSuggesterOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 px-4 py-3 text-sm font-extrabold text-primary transition-all cursor-pointer min-h-[48px]"
          >
            <Sparkles size={16} className="text-primary" />
            <span>Rezepte aus Vorrat generieren</span>
          </button>
        </div>
      </div>

      {/* Quick Add Form Section */}
      <form onSubmit={handleAddSubmit} className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted flex items-center gap-2">
          <Plus size={16} className="text-primary" /> Zutat auf Vorrat hinzufügen
        </h4>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            step="any"
            value={newAmount || ""}
            onChange={(e) => setNewAmount(parseFloat(e.target.value) || 0)}
            placeholder="Menge"
            className="w-24 h-12 rounded-xl border border-border bg-background px-3 text-sm text-center font-bold focus:border-primary focus:outline-none"
            required
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold focus:border-primary focus:outline-none"
          >
            {SUPPORTED_UNITS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNewCategory(getInventoryCategory(e.target.value));
            }}
            placeholder="Zutat (z.B. Butter)"
            className="flex-1 min-w-44 h-12 rounded-xl border border-border bg-background px-4 text-sm font-bold focus:border-primary focus:outline-none"
            required
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold focus:border-primary focus:outline-none"
          >
            {INVENTORY_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isAdding}
            className="h-12 rounded-xl bg-primary px-5 text-sm font-extrabold text-white hover:bg-primary-hover shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 self-stretch"
          >
            {isAdding ? <Loader className="h-4 w-4 text-white" /> : <Plus size={16} />}
            <span>Hinzufügen</span>
          </button>
        </div>
      </form>

      {/* Häufig gelagert (Quick Inventory Add) */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
        <button
          type="button"
          onClick={() => setIsFrequentOpen(!isFrequentOpen)}
          className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-on-surface-muted cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <Package size={16} className="text-primary" /> Häufig gelagert (Schnellwahl)
          </span>
          {isFrequentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isFrequentOpen && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1 animate-scale-in">
            {FREQUENT_INGREDIENTS.map((ing) => {
              const existingItem = getInventoryItem(ing.name);
              const inStock = !!existingItem;
              const IconComponent = getIngredientIcon(ing.iconName);

              return (
                <button
                  key={ing.id}
                  type="button"
                  onClick={() => handleFrequentAdd(ing)}
                  className={`group relative h-24 rounded-2xl flex flex-col items-center justify-center p-2.5 text-center gap-1.5 transition-all duration-200 active:scale-95 cursor-pointer border ${
                    inStock
                      ? "bg-primary-light border-primary/20 text-primary shadow-xs"
                      : "bg-muted/40 border-border hover:bg-muted/70 text-on-surface hover:border-on-surface-muted/30"
                  }`}
                >
                  <IconComponent 
                    size={20} 
                    className={inStock ? "text-primary" : "text-on-surface-muted"} 
                  />
                  <span className="text-xs font-bold truncate w-full px-1">
                    {ing.name}
                  </span>
                  
                  {inStock ? (
                    <>
                      <span className="text-[10px] font-extrabold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                        {formatAmount(existingItem.amount, existingItem.unit)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleFrequentRemove(e, ing)}
                        className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-error text-white hover:bg-error/90 flex items-center justify-center shadow-xs cursor-pointer active:scale-90 transition-transform"
                        title="Menge reduzieren"
                      >
                        <Minus size={12} strokeWidth={4} />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold text-on-surface-muted opacity-60">
                      +{formatAmount(ing.defaultAmount, ing.defaultUnit)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute top-4 left-4 h-5 w-5 text-on-surface-muted" />
        <input
          type="text"
          placeholder="Vorräte durchsuchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-12 rounded-2xl border border-border bg-surface pr-10 pl-12 text-sm focus:border-primary focus:outline-none shadow-xs transition-colors font-medium"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery("")} 
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer font-extrabold"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Stock list container */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader className="h-8 w-8 text-primary" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-2xl bg-surface/50 h-40 gap-2">
          <Package size={24} className="text-on-surface-muted" />
          <div>
            <p className="font-bold text-xs text-on-surface">Keine Vorratseinträge vorhanden</p>
            <p className="text-[10px] text-on-surface-muted mt-0.5">
              {searchQuery ? "Passe deinen Suchbegriff an." : "Füge oben die erste Zutat hinzu."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {INVENTORY_CATEGORIES.map((cat) => {
            const catItems = groupedInventory[cat] || [];
            if (catItems.length === 0) return null;

            return (
              <div key={cat} className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-muted px-1.5">
                  {cat}
                </h4>
                <ul className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/50 shadow-xs">
                  {catItems.map((item) => {
                    const isEditing = item.id === editingId;

                    return (
                      <li 
                        key={item.id} 
                        className={`px-4 py-3.5 flex justify-between items-center text-sm font-semibold transition-colors ${
                          isEditing ? "bg-primary-light/10" : "hover:bg-muted/15"
                        }`}
                      >
                        {isEditing ? (
                          // Inline Row Editor
                          <div className="flex flex-wrap gap-2 items-center flex-1 pr-4">
                            <input
                              type="number"
                              step="any"
                              value={editAmount || ""}
                              onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                              className="w-16 h-10 rounded-lg border border-border bg-background p-1.5 text-center text-sm font-bold focus:outline-none"
                            />
                            <select
                              value={editUnit}
                              onChange={(e) => setEditUnit(e.target.value)}
                              className="h-10 rounded-lg border border-border bg-background p-1.5 text-sm font-bold focus:outline-none"
                            >
                              {SUPPORTED_UNITS.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 min-w-[120px] h-10 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-bold focus:outline-none"
                            />
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="h-10 rounded-lg border border-border bg-background p-1.5 text-sm font-bold focus:outline-none"
                            >
                              {INVENTORY_CATEGORIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={editEstimate}
                                onChange={(e) => setEditEstimate(e.target.checked)}
                                className="h-5 w-5 rounded border-border text-primary cursor-pointer focus:ring-primary"
                                id={`edit-estimate-${item.id}`}
                              />
                              <label htmlFor={`edit-estimate-${item.id}`} className="text-xs font-bold text-on-surface-muted select-none">
                                Schätzung (~)
                              </label>
                            </div>
                          </div>
                        ) : (
                          // Text Display
                          <div className="flex flex-col gap-1">
                            <span className="text-on-surface text-base font-medium">{item.name}</span>
                            <span className="text-xs text-on-surface-muted font-bold">
                              Vorhanden: {item.isEstimate ? "~ " : ""}{formatAmount(item.amount, item.unit)}
                            </span>
                          </div>
                        )}

                        {/* Inline Action Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(item.id)}
                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-success/10 text-success hover:bg-success/20 cursor-pointer"
                                title="Speichern"
                              >
                                <Check size={16} strokeWidth={3} />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted text-on-surface-muted hover:bg-border cursor-pointer"
                                title="Abbrechen"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(item)}
                                className="p-2.5 rounded-xl text-on-surface-muted hover:bg-muted cursor-pointer transition-colors"
                                title="Bearbeiten"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="p-2.5 rounded-xl text-error hover:bg-error/5 cursor-pointer transition-colors"
                                title="Löschen"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Recipe Suggester Modal */}
      <RecipeSuggester isOpen={isSuggesterOpen} onClose={() => setIsSuggesterOpen(false)} />

      {/* AI scan loading overlay */}
      {isScanning && <AiScanOverlay onCancel={() => setIsScanning(false)} />}

      {/* AI scan review dialog */}
      <InventoryScanReview
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        initialIngredients={scannedIngredients}
        onSave={handleSaveScannedIngredients}
      />
    </div>
  );
}
