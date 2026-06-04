import React, { useState, useEffect } from "react";
import { 
  X, 
  Sparkles, 
  ShoppingBag, 
  Check, 
  Calendar, 
  Clock, 
  Utensils, 
  ChevronDown, 
  ChevronUp 
} from "lucide-react";
import { useInventory } from "../hooks/useInventory";
import { useRecipes, Ingredient, Step, Nutrition } from "../hooks/useRecipes";
import { useMealPlan } from "../hooks/useMealPlan";
import { apiFetch } from "../api/apiClient";

interface RecipeSuggesterProps {
  isOpen: boolean;
  onClose: () => void;
  initialDaysCount?: number;
}

interface SuggestionIngredient extends Ingredient {
  isMissing: boolean;
}

interface SuggestedRecipe {
  assignedDay: string | null;
  title: string;
  servings: number;
  cookingTimeMinutes: number;
  dietaryTags: string[];
  ingredients: SuggestionIngredient[];
  steps: Step[];
  nutrition: Nutrition;
}

const PRESET_PREFERENCES = [
  "vegan", "vegetarisch", "glutenfrei", "low-carb", 
  "laktosefrei", "asiatisch", "italienisch", "deftig", "schnell"
];

export default function RecipeSuggester({ isOpen, onClose, initialDaysCount = 1 }: RecipeSuggesterProps) {
  const { inventoryItems, isLoading: isInventoryLoading } = useInventory();
  const { saveRecipe } = useRecipes();
  const { addToMealPlan } = useMealPlan();

  // Dialog configurations
  const [selectedStock, setSelectedStock] = useState<string[]>([]);
  const [daysCount, setDaysCount] = useState<number>(initialDaysCount);
  const [allowShopping, setAllowShopping] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [customPref, setCustomPref] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // Searching stock items
  const [searchQuery, setSearchQuery] = useState<string>("");

  // States for API call
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // UI state for cards
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [savedStatus, setSavedStatus] = useState<Record<number, "idle" | "saving" | "saved">>({});

  // Reset states when opening
  useEffect(() => {
    if (isOpen) {
      setSuggestions([]);
      setErrorMsg("");
      setDaysCount(initialDaysCount);
      // Pre-select all stock items initially
      if (inventoryItems.length > 0) {
        setSelectedStock(inventoryItems.map(item => item.name));
      }
    }
  }, [isOpen, inventoryItems, initialDaysCount]);

  if (!isOpen) return null;

  const toggleStockItem = (name: string) => {
    setSelectedStock(prev => 
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStock.length === inventoryItems.length) {
      setSelectedStock([]);
    } else {
      setSelectedStock(inventoryItems.map(item => item.name));
    }
  };

  const togglePreference = (pref: string) => {
    setPreferences(prev => 
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  const handleAddCustomPref = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customPref.trim().toLowerCase();
    if (clean && !preferences.includes(clean)) {
      setPreferences([...preferences, clean]);
    }
    setCustomPref("");
  };

  const handleRemovePreference = (pref: string) => {
    setPreferences(prev => prev.filter(p => p !== pref));
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setErrorMsg("");
    setSavedStatus({});
    setExpandedSteps({});

    const allStockNames = inventoryItems.map(i => i.name);

    try {
      const response = await apiFetch("/api/recipe/suggest", {
        method: "POST",
        body: JSON.stringify({
          availableIngredients: allStockNames,
          selectedIngredients: selectedStock,
          daysCount,
          allowShopping,
          preferences
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        if (!data.suggestions || data.suggestions.length === 0) {
          setErrorMsg("Die KI konnte keine Rezepte mit diesen Einstellungen generieren. Probiere es mit anderen Zutaten.");
        }
      } else {
        const errText = await response.text();
        setErrorMsg(errText || "Verbindungsfehler bei der Rezeptgenerierung.");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Ein Netzwerkfehler ist aufgetreten. Bitte versuche es erneut.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPlannedDate = (assignedDay: string | null, start: string): string => {
    if (!assignedDay) return start;
    // Extract number from "Tag 1", "Tag 2"
    const match = /\d+/.exec(assignedDay);
    if (!match) return start;
    const dayOffset = parseInt(match[0]) - 1;
    
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);
    return date.toISOString().split("T")[0];
  };

  const formatDateLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
  };

  const handleSaveAndPlan = async (recipeIdx: number, plan: boolean) => {
    const recipe = suggestions[recipeIdx];
    setSavedStatus(prev => ({ ...prev, [recipeIdx]: "saving" }));

    try {
      const generatedId = window.crypto.randomUUID();
      
      // 1. Save recipe via hook (performs E2EE encryption inside hook)
      await saveRecipe({
        id: generatedId,
        title: recipe.title,
        servings: recipe.servings,
        cookingTimeMinutes: recipe.cookingTimeMinutes,
        source: "KI Rezept-Planer",
        dietaryTags: recipe.dietaryTags,
        ingredients: recipe.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit })),
        steps: recipe.steps,
        nutrition: recipe.nutrition,
        photo_path: null,
        rating: null
      });

      // 2. Plan in weekly planner if requested
      if (plan) {
        const targetDate = getPlannedDate(recipe.assignedDay, startDate);
        await addToMealPlan({
          recipe_id: generatedId,
          week_date: targetDate,
          servings: recipe.servings
        });
      }

      setSavedStatus(prev => ({ ...prev, [recipeIdx]: "saved" }));
      const toastEvent = new CustomEvent("show-toast", { 
        detail: { 
          msg: plan ? `"${recipe.title}" wurde gespeichert & geplant!` : `"${recipe.title}" wurde in deiner Sammlung gespeichert!`, 
          type: "success" 
        } 
      });
      window.dispatchEvent(toastEvent);
    } catch (err) {
      console.error(err);
      setSavedStatus(prev => ({ ...prev, [recipeIdx]: "idle" }));
      const toastEvent = new CustomEvent("show-toast", { 
        detail: { msg: "Fehler beim Speichern des Rezepts.", type: "error" } 
      });
      window.dispatchEvent(toastEvent);
    }
  };

  const filteredStock = inventoryItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-scale-in">
      <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-surface text-on-surface shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="text-md font-extrabold tracking-tight text-on-surface">KI Rezept-Planer</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer"
            title="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {suggestions.length === 0 ? (
            // Configuration Phase
            <div className="space-y-6">
              
              {/* stock items selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                    Zutaten aus Deinem Vorrat auswählen
                  </label>
                  <button 
                    type="button" 
                    onClick={toggleSelectAll} 
                    className="text-xs font-bold text-primary hover:text-primary-hover cursor-pointer"
                  >
                    {selectedStock.length === inventoryItems.length ? "Keine auswählen" : "Alle auswählen"}
                  </button>
                </div>
                
                <input 
                  type="text" 
                  placeholder="Zutaten durchsuchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
                />

                {isInventoryLoading ? (
                  <p className="text-xs text-on-surface-muted">Lade Vorräte...</p>
                ) : inventoryItems.length === 0 ? (
                  <p className="text-xs text-on-surface-muted italic">Keine Zutaten im Vorrat eingetragen. Trage zuerst Vorräte ein oder schalte "Ich gehe noch einkaufen" an.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto border border-border/50 rounded-xl p-2 bg-background/30">
                    {filteredStock.map(item => {
                      const isSelected = selectedStock.includes(item.name);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleStockItem(item.name)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            isSelected 
                              ? "bg-primary-light border-primary/20 text-primary" 
                              : "bg-surface border-border text-on-surface-muted hover:bg-muted"
                          }`}
                        >
                          {isSelected ? "✓ " : ""} {item.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Slider for days and einkaufen switch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Days Count */}
                <div className="rounded-xl border border-border bg-background/20 p-3.5 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted block">
                    Wie viele Tage planen?
                  </label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" 
                      max="7" 
                      value={daysCount}
                      onChange={(e) => setDaysCount(parseInt(e.target.value))}
                      className="flex-1 accent-primary cursor-pointer"
                    />
                    <span className="text-sm font-extrabold text-primary w-14 text-center">
                      {daysCount} {daysCount === 1 ? "Tag" : "Tage"}
                    </span>
                  </div>
                </div>

                {/* Shopping switch */}
                <div className="rounded-xl border border-border bg-background/20 p-3.5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted block">
                      Vorher noch einkaufen?
                    </label>
                    <span className="text-[10px] text-on-surface-muted block pr-4">
                      Falls an, darf die KI fehlende Zutaten hinzufügen.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllowShopping(prev => !prev)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      allowShopping ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        allowShopping ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

              </div>

              {/* Start Date configuration for planner mapping */}
              {daysCount > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                    Startdatum für Wochenplan
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold focus:outline-none"
                  />
                </div>
              )}

              {/* Preferences selectors */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted block">
                  Vorlieben & Wünsche
                </label>
                
                {/* Active custom tags */}
                {preferences.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {preferences.map(pref => (
                      <span 
                        key={pref} 
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-primary text-white"
                      >
                        <span>{pref}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemovePreference(pref)}
                          className="hover:bg-primary-hover rounded-full p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Preset tags grid */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PREFERENCES.map(pref => {
                    const isActive = preferences.includes(pref);
                    return (
                      <button
                        key={pref}
                        type="button"
                        onClick={() => togglePreference(pref)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          isActive 
                            ? "bg-primary border-primary text-white" 
                            : "bg-surface border-border text-on-surface-muted hover:bg-muted"
                        }`}
                      >
                        {pref}
                      </button>
                    );
                  })}
                </div>

                {/* Custom preference text input */}
                <form onSubmit={handleAddCustomPref} className="flex gap-2">
                  <input
                    type="text"
                    value={customPref}
                    onChange={(e) => setCustomPref(e.target.value)}
                    placeholder="Eigene Vorliebe hinzufügen (z.B. Nudeln, scharf)"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors font-extrabold text-xs cursor-pointer"
                  >
                    Hinzufügen
                  </button>
                </form>

              </div>

              {/* Trigger generate button */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className="w-full rounded-2xl bg-primary py-3.5 font-extrabold text-white hover:bg-primary-hover shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={18} className={isLoading ? "animate-spin" : ""} />
                <span>{isLoading ? "Plane Rezepte per KI..." : "Rezepte vorschlagen lassen"}</span>
              </button>

              {errorMsg && (
                <div className="rounded-xl bg-error/15 p-3 text-xs text-error font-semibold">
                  ⚠️ {errorMsg}
                </div>
              )}

            </div>
          ) : (
            // Suggestions Display Phase
            <div className="space-y-6">
              
              <div className="flex justify-between items-center bg-primary-light/50 p-3 rounded-xl border border-primary/10">
                <span className="text-xs font-bold text-primary">Vorschläge erfolgreich generiert!</span>
                <button
                  type="button"
                  onClick={() => setSuggestions([])}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Einstellungen ändern
                </button>
              </div>

              {suggestions.map((recipe, idx) => {
                const isExpanded = !!expandedSteps[idx];
                const status = savedStatus[idx] || "idle";
                const plannedDate = getPlannedDate(recipe.assignedDay, startDate);

                return (
                  <div key={idx} className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
                    
                    {/* Card Header */}
                    <div className="bg-muted/40 p-4 border-b border-border/50 flex flex-wrap gap-2 justify-between items-center">
                      <div>
                        {recipe.assignedDay && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-primary mb-1 bg-primary-light px-2 py-0.5 rounded-md border border-primary/10">
                            <Calendar size={10} />
                            {recipe.assignedDay} ({formatDateLabel(plannedDate)})
                          </span>
                        )}
                        <h4 className="text-md font-extrabold text-on-surface">{recipe.title}</h4>
                      </div>
                      
                      {/* Scale details */}
                      <div className="flex gap-3 text-[10px] font-bold text-on-surface-muted uppercase">
                        <span className="flex items-center gap-1"><Clock size={12} /> {recipe.cookingTimeMinutes} Min.</span>
                        <span className="flex items-center gap-1"><Utensils size={12} /> {recipe.servings} Port.</span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      
                      {/* Tags */}
                      {recipe.dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {recipe.dietaryTags.map(tag => (
                            <span key={tag} className="text-[10px] font-extrabold bg-muted text-on-surface-muted px-2 py-0.5 rounded-md border border-border/50">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Ingredients List */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-on-surface-muted uppercase tracking-wider block">Zutaten</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {recipe.ingredients.map((ing, iIdx) => (
                            <div 
                              key={iIdx} 
                              className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold border ${
                                ing.isMissing 
                                  ? "bg-error/5 border-error/15 text-error" 
                                  : "bg-success/5 border-success/15 text-success"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                {ing.isMissing ? <ShoppingBag size={12} /> : <Check size={12} />}
                                <span>{ing.name}</span>
                              </span>
                              <span className="font-bold opacity-80">{ing.amount} {ing.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Steps (Collapsible) */}
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setExpandedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))}
                          className="flex items-center gap-1 text-[10px] font-bold text-on-surface-muted uppercase tracking-wider cursor-pointer hover:text-on-surface transition-colors"
                        >
                          <span>Zubereitungsschritte</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {isExpanded && (
                          <ol className="list-decimal list-inside pl-1 text-xs space-y-1.5 bg-background/25 border border-border/55 rounded-xl p-3">
                            {recipe.steps.map((step, sIdx) => (
                              <li key={sIdx} className="leading-relaxed">
                                <span className="font-medium text-on-surface">{step.description}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>

                      {/* Nutrition values grid */}
                      <div className="rounded-xl border border-border/60 p-3 bg-background/10 space-y-1.5">
                        <span className="text-[10px] font-bold text-on-surface-muted uppercase tracking-wider block">Nährwerte (pro Portion)</span>
                        <div className="grid grid-cols-4 gap-1 text-center text-xs font-bold">
                          <div>
                            <span className="text-[10px] text-on-surface-muted block font-semibold">Kcal</span>
                            <span className="text-on-surface">{recipe.nutrition.caloriesPerServing}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-on-surface-muted block font-semibold">Protein</span>
                            <span className="text-on-surface">{recipe.nutrition.proteinG}g</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-on-surface-muted block font-semibold">Fett</span>
                            <span className="text-on-surface">{recipe.nutrition.fatG}g</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-on-surface-muted block font-semibold">Kohlenhydrate</span>
                            <span className="text-on-surface">{recipe.nutrition.carbsG}g</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        {recipe.assignedDay ? (
                          // Save & Plan
                          <button
                            type="button"
                            disabled={status !== "idle"}
                            onClick={() => handleSaveAndPlan(idx, true)}
                            className="flex-1 rounded-xl bg-primary text-white hover:bg-primary-hover font-extrabold text-xs py-2.5 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-75"
                          >
                            {status === "saving" && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                            {status === "saved" && <Check size={14} />}
                            <span>
                              {status === "idle" && "Speichern & im Wochenplan eintragen"}
                              {status === "saving" && "Speichere..."}
                              {status === "saved" && "Gespeichert & geplant"}
                            </span>
                          </button>
                        ) : (
                          // Save Only
                          <button
                            type="button"
                            disabled={status !== "idle"}
                            onClick={() => handleSaveAndPlan(idx, false)}
                            className="flex-1 rounded-xl bg-primary text-white hover:bg-primary-hover font-extrabold text-xs py-2.5 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-75"
                          >
                            {status === "saving" && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                            {status === "saved" && <Check size={14} />}
                            <span>
                              {status === "idle" && "Rezept speichern"}
                              {status === "saving" && "Speichere..."}
                              {status === "saved" && "Gespeichert"}
                            </span>
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
