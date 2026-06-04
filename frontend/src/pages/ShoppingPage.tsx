import React, { useState, useMemo } from "react";
import { 
  Check, 
  Trash2, 
  Plus, 
  ShoppingCart, 
  Loader2, 
  CheckSquare, 
  PlusCircle,
  ChevronDown,
  ChevronUp,
  Edit2,
  X
} from "lucide-react";

import { useShoppingList, ShoppingItem } from "../hooks/useShoppingList";
import { formatAmount, SUPPORTED_UNITS, convert } from "../utils/unitConverter";
import { FREQUENT_INGREDIENTS, getIngredientIcon, getIconForIngredient } from "../utils/frequentIngredients";
import { SHOPPING_CATEGORIES, getShoppingCategory as getCategory } from "../utils/categorizer";
import { useMealPlan } from "../hooks/useMealPlan";
import { useRecipes } from "../hooks/useRecipes";
import { useInventory } from "../hooks/useInventory";
import { getDepletedIngredients, removeIngredientFromDepleted } from "../utils/depletedTracker";

export default function ShoppingPage() {
  const { 
    shoppingItems, 
    isLoading, 
    saveItem, 
    toggleCheckItem,
    deleteItem, 
    clearCheckedItems 
  } = useShoppingList();

  // Quick Add Item States
  const [name, setName] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [unit, setUnit] = useState<string>("Stück");
  const [category, setCategory] = useState<string>("Sonstiges");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Quick Select Panel State
  const [isFrequentOpen, setIsFrequentOpen] = useState<boolean>(true);

  // Dynamic Suggestions Engine
  const { mealPlan } = useMealPlan();
  const { recipes } = useRecipes();
  const { inventoryItems } = useInventory();

  const dynamicSuggestions = useMemo(() => {
    const suggestionsMap = new Map<string, {
      id: string;
      name: string;
      defaultAmount: number;
      defaultUnit: string;
      category: string;
      iconName: string;
      reason: "Geplant" | "Aufgebraucht" | "Häufig";
      priority: number;
    }>();

    // 1. Priority 1: Gaps in planned recipes
    const neededIngredientsMap = new Map<string, { name: string; amount: number; unit: string; category: string }>();

    for (const plan of mealPlan) {
      const recipe = recipes.find(r => r.id === plan.recipe_id);
      if (!recipe) continue;
      
      const factor = plan.servings / recipe.servings;
      for (const ing of recipe.ingredients) {
        const key = `${ing.name.toLowerCase().trim()}_${ing.unit.toLowerCase().trim()}`;
        const current = neededIngredientsMap.get(key) || { 
          name: ing.name, 
          amount: 0.0, 
          unit: ing.unit,
          category: getCategory(ing.name)
        };
        current.amount += ing.amount * factor;
        neededIngredientsMap.set(key, current);
      }
    }

    // Compare with inventory stock
    for (const needed of neededIngredientsMap.values()) {
      let stockAmount = 0.0;
      const matchingInvItems = inventoryItems.filter(
        i => i.name.toLowerCase().trim() === needed.name.toLowerCase().trim()
      );

      for (const inv of matchingInvItems) {
        const converted = convert(inv.amount, inv.unit, needed.unit);
        if (converted !== null) {
          stockAmount += converted;
        }
      }

      const gap = needed.amount - stockAmount;
      if (gap > 0.01) {
        const nameKey = needed.name.toLowerCase().trim();
        suggestionsMap.set(nameKey, {
          id: `planned_${nameKey}`,
          name: needed.name,
          defaultAmount: parseFloat(gap.toFixed(2)),
          defaultUnit: needed.unit,
          category: needed.category,
          iconName: getIconForIngredient(needed.name),
          reason: "Geplant",
          priority: 1
        });
      }
    }

    // 2. Priority 2: Depleted inventory items
    for (const inv of inventoryItems) {
      if (inv.amount <= 0.01) {
        const nameKey = inv.name.toLowerCase().trim();
        if (!suggestionsMap.has(nameKey)) {
          const freqBase = FREQUENT_INGREDIENTS.find(f => f.name.toLowerCase().trim() === nameKey);
          suggestionsMap.set(nameKey, {
            id: `depleted_inv_${nameKey}`,
            name: inv.name,
            defaultAmount: freqBase ? freqBase.defaultAmount : 1,
            defaultUnit: inv.unit || (freqBase ? freqBase.defaultUnit : "Stück"),
            category: inv.category || getCategory(inv.name),
            iconName: getIconForIngredient(inv.name),
            reason: "Aufgebraucht",
            priority: 2
          });
        }
      }
    }

    // Second, scan the local storage depletedTracker list
    const depletedItems = getDepletedIngredients();
    for (const depItem of depletedItems) {
      const depName = typeof depItem === "string" ? depItem : depItem.name;
      const depAmount = typeof depItem === "string" ? 1 : depItem.amount;
      const depUnit = typeof depItem === "string" ? "Stück" : depItem.unit;

      const nameKey = depName.trim().toLowerCase();
      const inStock = inventoryItems.some(
        i => i.name.toLowerCase().trim() === nameKey && i.amount > 0.01
      );
      
      if (!inStock && !suggestionsMap.has(nameKey)) {
        const freqBase = FREQUENT_INGREDIENTS.find(f => f.name.toLowerCase().trim() === nameKey);
        const invBase = inventoryItems.find(i => i.name.toLowerCase().trim() === nameKey);
        const displayName = invBase ? invBase.name : (freqBase ? freqBase.name : depName.charAt(0).toUpperCase() + depName.slice(1));
        
        suggestionsMap.set(nameKey, {
          id: `depleted_tracker_${nameKey}`,
          name: displayName,
          defaultAmount: freqBase ? freqBase.defaultAmount : (invBase ? invBase.amount || depAmount : depAmount),
          defaultUnit: invBase ? invBase.unit : (freqBase ? freqBase.defaultUnit : depUnit),
          category: invBase?.category || freqBase?.category || getCategory(displayName),
          iconName: getIconForIngredient(displayName),
          reason: "Aufgebraucht",
          priority: 2
        });
      }
    }

    // 3. Priority 3: Frequent baseline items (static fallbacks)
    for (const freq of FREQUENT_INGREDIENTS) {
      const nameKey = freq.name.toLowerCase().trim();
      if (!suggestionsMap.has(nameKey)) {
        suggestionsMap.set(nameKey, {
          id: freq.id,
          name: freq.name,
          defaultAmount: freq.defaultAmount,
          defaultUnit: freq.defaultUnit,
          category: freq.category,
          iconName: freq.iconName,
          reason: "Häufig",
          priority: 3
        });
      }
    }

    const list = Array.from(suggestionsMap.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.name.localeCompare(b.name);
    });

    return list.slice(0, 12);
  }, [mealPlan, recipes, inventoryItems]);

  // Inline Editing States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editUnit, setEditUnit] = useState<string>("Stück");
  const [editCategory, setEditCategory] = useState<string>("Sonstiges");

  const handleStartEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditAmount(item.amount);
    setEditUnit(item.unit);
    setEditCategory(item.category || "Sonstiges");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || editAmount <= 0) return;
    try {
      await saveItem({
        id,
        name: editName.trim(),
        amount: editAmount,
        unit: editUnit,
        category: editCategory,
        is_checked: false
      });
      removeIngredientFromDepleted(editName.trim());
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const getActiveShoppingItem = (itemName: string) => {
    return shoppingItems.find(item => item.name.toLowerCase().trim() === itemName.toLowerCase().trim() && !item.is_checked);
  };

  const getCheckedShoppingItem = (itemName: string) => {
    return shoppingItems.find(item => item.name.toLowerCase().trim() === itemName.toLowerCase().trim() && item.is_checked);
  };

  const handleSuggestionClick = async (sug: typeof dynamicSuggestions[0]) => {
    const activeItem = getActiveShoppingItem(sug.name);
    if (activeItem) {
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
      await toggleCheckItem({ id: activeItem.id, isChecked: true });
    } else {
      const checkedItem = getCheckedShoppingItem(sug.name);
      if (checkedItem) {
        await toggleCheckItem({ id: checkedItem.id, isChecked: false });
      } else {
        await saveItem({
          name: sug.name,
          amount: sug.defaultAmount,
          unit: sug.defaultUnit,
          category: sug.category
        });
        removeIngredientFromDepleted(sug.name);
      }
    }
  };

  // Group items by category (excluding checked items from main group)
  const uncheckedItems = shoppingItems.filter(item => !item.is_checked);
  const checkedItems = shoppingItems.filter(item => item.is_checked);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (amount <= 0) {
      const toastEvent = new CustomEvent("show-toast", {
        detail: { msg: "Die Menge muss größer als 0 sein.", type: "error" }
      });
      window.dispatchEvent(toastEvent);
      return;
    }

    setIsAdding(true);
    try {
      await saveItem({
        name: name.trim(),
        amount,
        unit,
        category: category || getCategory(name) // Auto-detect if category is empty
      });
      removeIngredientFromDepleted(name.trim());
      setName("");
      setAmount(0);
      setUnit("Stück");
      setCategory("Sonstiges");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleCheck = async (id: string, currentlyChecked: boolean) => {
    // Triggers localDb updates and haptic vibration inside mutation
    if ("vibrate" in navigator) {
      navigator.vibrate(50); // micro-vibration feedback on checkoff
    }
    await toggleCheckItem({ id, isChecked: !currentlyChecked });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8 space-y-6">
      
      {/* Header banner */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Einkaufsliste</h2>
          <p className="text-sm text-on-surface-muted">Verwalte deine Einkaufsliste und übertrage Einkäufe in deine Vorratskammer.</p>
        </div>

        {/* Clear completed button */}
        {checkedItems.length > 0 && (
          <button
            onClick={clearCheckedItems}
            className="flex items-center gap-2 rounded-xl border border-error bg-surface text-error px-5 py-3 text-sm font-extrabold hover:bg-error/5 cursor-pointer transition-colors"
          >
            <Trash2 size={16} />
            <span>Erledigte löschen</span>
          </button>
        )}
      </div>

      {/* Manual Quick Add Form */}
      <form onSubmit={handleAddSubmit} className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted flex items-center gap-2">
          <PlusCircle size={16} className="text-primary" /> Artikel manuell hinzufügen
        </h4>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            step="any"
            value={amount || ""}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            placeholder="Menge"
            className="w-20 h-12 rounded-xl border border-border bg-background px-3 text-sm text-center font-bold focus:border-primary focus:outline-none"
            required
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold focus:border-primary focus:outline-none"
          >
            {SUPPORTED_UNITS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setCategory(getCategory(e.target.value)); // Auto category detection as user types!
            }}
            placeholder="Artikelname (z.B. Äpfel)"
            className="flex-1 min-w-40 h-12 rounded-xl border border-border bg-background px-4 text-sm font-bold focus:border-primary focus:outline-none"
            required
          />
          
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold focus:border-primary focus:outline-none"
          >
            {SHOPPING_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isAdding}
            className="h-12 rounded-xl bg-primary px-5 text-sm font-extrabold text-white hover:bg-primary-hover shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 self-stretch"
          >
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
            <span>Hinzufügen</span>
          </button>
        </div>
      </form>

      {/* Einkaufsvorschläge (Quick Selection) */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
        <button
          type="button"
          onClick={() => setIsFrequentOpen(!isFrequentOpen)}
          className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-on-surface-muted cursor-pointer select-none"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" /> Einkaufsvorschläge (Schnellwahl)
          </span>
          {isFrequentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isFrequentOpen && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1 animate-scale-in">
            {dynamicSuggestions.map((sug) => {
              const activeItem = getActiveShoppingItem(sug.name);
              const isActive = !!activeItem;
              const IconComponent = getIngredientIcon(sug.iconName);

              return (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => handleSuggestionClick(sug)}
                  className={`relative h-24 rounded-2xl flex flex-col items-center justify-center p-2.5 text-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer border ${
                    isActive
                      ? "bg-primary border-primary text-white shadow-sm"
                      : "bg-muted/40 border-border hover:bg-muted/70 text-on-surface hover:border-on-surface-muted/30"
                  }`}
                >
                  {/* Reason Badge */}
                  <span className={`absolute top-1.5 left-2 text-[8px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${
                    isActive 
                      ? "bg-white/20 text-white" 
                      : sug.reason === "Geplant"
                        ? "bg-primary-light text-primary border border-primary/10"
                        : sug.reason === "Aufgebraucht"
                          ? "bg-error/15 text-error border border-error/10"
                          : "bg-muted text-on-surface-muted border border-border"
                  }`}>
                    {sug.reason}
                  </span>

                  <IconComponent 
                    size={20} 
                    className={isActive ? "text-white" : "text-on-surface-muted"} 
                  />
                  <span className="text-xs font-bold truncate w-full px-1 mt-1 leading-tight">
                    {sug.name}
                  </span>
                  <span className={`text-[10px] font-semibold tracking-tight ${isActive ? "text-white/80" : "text-on-surface-muted"}`}>
                    {isActive ? "Auf der Liste" : `+ ${sug.defaultAmount} ${sug.defaultUnit}`}
                  </span>
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-white/20 p-1 text-white flex items-center justify-center">
                      <Check size={10} strokeWidth={4} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main categorised Shopping Lists display */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : shoppingItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-2xl bg-surface/50 h-40 gap-2">
          <ShoppingCart size={24} className="text-on-surface-muted" />
          <div>
            <p className="font-bold text-xs text-on-surface">Deine Einkaufsliste ist leer</p>
            <p className="text-[10px] text-on-surface-muted mt-0.5">
              Füge Artikel über die Wochenplanung oder manuell hinzu!
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Loop over categories containing unchecked items */}
          {SHOPPING_CATEGORIES.map((cat) => {
            const catItems = uncheckedItems.filter(item => item.category === cat);
            if (catItems.length === 0) return null;

            return (
              <div key={cat} className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-on-surface-muted px-1.5">
                  {cat}
                </h4>
                <ul className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/50 shadow-xs">
                  {catItems.map((item) => {
                    const isEditing = item.id === editingId;

                    return isEditing ? (
                      <li 
                        key={item.id}
                        className="px-4 py-3 flex justify-between items-center text-sm font-semibold bg-primary-light/10"
                      >
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
                            {SHOPPING_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
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
                        </div>
                      </li>
                    ) : (
                      <li 
                        key={item.id}
                        className="px-4 py-3.5 flex justify-between items-center text-sm font-semibold hover:bg-muted/15"
                      >
                        <div className="flex items-center gap-3.5 flex-1 pr-4">
                          <button
                            type="button"
                            onClick={() => handleToggleCheck(item.id, item.is_checked)}
                            className="h-6 w-6 rounded-md border border-border bg-background flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <div className="h-4 w-4 rounded-xs bg-transparent" />
                          </button>
                          <span className="text-on-surface text-base font-medium">{item.name}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface bg-muted/60 px-2.5 py-1 rounded-full shrink-0">
                            {formatAmount(item.amount, item.unit)}
                          </span>
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-2.5 rounded-xl text-on-surface-muted hover:text-primary hover:bg-primary-light/50 cursor-pointer transition-colors"
                            title="Bearbeiten"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="p-2.5 rounded-xl text-on-surface-muted hover:text-error hover:bg-error/5 cursor-pointer transition-colors"
                            title="Löschen"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* COMPLETED ITEMS GROUP (Grayed out at bottom) */}
          {checkedItems.length > 0 && (
            <div className="space-y-2 pt-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-success px-1.5 flex items-center gap-2">
                <CheckSquare size={16} /> Erledigte Einkäufe ({checkedItems.length})
              </h4>
              <ul className="rounded-2xl border border-border bg-surface/50 overflow-hidden divide-y divide-border/40 shadow-inner">
                {checkedItems.map((item) => (
                  <li 
                    key={item.id}
                    className="px-4 py-3.5 flex justify-between items-center text-sm font-semibold bg-muted/20"
                  >
                    <div className="flex items-center gap-3.5 flex-1 pr-4">
                      <button
                        type="button"
                        onClick={() => handleToggleCheck(item.id, item.is_checked)}
                        className="h-6 w-6 rounded-md border border-success bg-success flex items-center justify-center cursor-pointer text-white"
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>
                      
                      {/* Checked item strike-through text */}
                      <span className="text-on-surface-muted text-base font-medium line-through decoration-on-surface-muted/50">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 opacity-65">
                      <span className="text-xs font-bold text-on-surface-muted bg-muted px-2.5 py-1 rounded-full">
                        {formatAmount(item.amount, item.unit)}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-2.5 rounded-xl text-on-surface-muted hover:text-error hover:bg-error/10 cursor-pointer"
                        title="Löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer toolbar progress summary */}
          <div className="text-xs font-bold text-on-surface-muted text-center pt-2 select-none">
            {checkedItems.length} von {shoppingItems.length} Artikeln erledigt ({shoppingItems.length > 0 ? Math.round((checkedItems.length / shoppingItems.length) * 100) : 0}%)
          </div>

        </div>
      )}

    </div>
  );
}
