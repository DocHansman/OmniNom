import { useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { Ingredient } from "../hooks/useRecipes";
import { useInventory } from "../hooks/useInventory";
import { convert, formatAmount } from "../utils/unitConverter";
import Loader from "./Loader";
import { markIngredientAsDepleted } from "../utils/depletedTracker";

interface IngredientConsumptionDialogProps {
  recipeTitle: string;
  ingredients: Ingredient[]; // Already scaled!
  onConfirm: () => void;
  onClose: () => void;
}

const STAPLE_WORDS = ["salz", "pfeffer", "wasser", "öl", "olivenöl", "rapsöl", "speiseöl", "zucker", "prise", "gewürz"];

function isStaple(name: string): boolean {
  const clean = name.toLowerCase().trim();
  return STAPLE_WORDS.some(word => clean === word || clean.includes(word));
}

export default function IngredientConsumptionDialog({
  recipeTitle,
  ingredients,
  onConfirm,
  onClose
}: IngredientConsumptionDialogProps) {
  const { inventoryItems, updateInventory } = useInventory();
  
  // Track checked state of ingredients to consume
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ingredients.forEach((ing, index) => {
      // Exclude staples by default
      initial[`${ing.name}_${index}`] = !isStaple(ing.name);
    });
    return initial;
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const toggleCheck = (key: string) => {
    setCheckedIngredients(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    const nonDeductedItems: string[] = [];
    try {
      // Create a mutable copy of the current inventory
      const updatedInventory = [...inventoryItems];

      for (let index = 0; index < ingredients.length; index++) {
        const ing = ingredients[index];
        const isChecked = checkedIngredients[`${ing.name}_${index}`];

        // Only process checked items
        if (!isChecked) continue;

        // Try to find matching inventory item
        const invItemIdx = updatedInventory.findIndex(
          item => item.name.toLowerCase().trim() === ing.name.toLowerCase().trim()
        );

        if (invItemIdx !== -1) {
          const invItem = updatedInventory[invItemIdx];
          
          // Attempt unit conversion
          const convertedAmount = convert(ing.amount, ing.unit, invItem.unit);
          
          if (convertedAmount !== null) {
            const newAmount = Math.max(0, invItem.amount - convertedAmount);
            if (newAmount <= 0.01) {
              // Stock exhausted, remove item from list
              markIngredientAsDepleted(invItem.name, invItem.amount, invItem.unit);
              updatedInventory.splice(invItemIdx, 1);
            } else {
              // Deduct stock amount
              updatedInventory[invItemIdx] = {
                ...invItem,
                amount: parseFloat(newAmount.toFixed(2))
              };
            }
          } else {
            // Units mismatch (e.g. piece vs grams), can't easily convert
            console.warn(`Unit mismatch: can't convert recipe ${ing.unit} to inventory ${invItem.unit} for ${ing.name}`);
            nonDeductedItems.push(`${ing.name} (${ing.unit} vs. ${invItem.unit})`);
          }
        }
      }

      // Write updated inventory back to E2EE storage
      await updateInventory(updatedInventory);
      console.log("Inventory consumption applied successfully!");
      
      if (nonDeductedItems.length > 0) {
        const event = new CustomEvent("show-toast", { 
          detail: { 
            msg: `Einige Zutaten wurden wegen abweichender Einheiten nicht abgezogen: ${nonDeductedItems.join(", ")}`, 
            type: "info" 
          } 
        });
        window.dispatchEvent(event);
      }
      
      onConfirm();
    } catch (e) {
      console.error("Error applying ingredient consumption:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-scale-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-on-surface">Zutaten verbraucht?</h3>
            <p className="text-xs text-on-surface-muted mt-0.5">Abzug für: {recipeTitle}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Info Warn */}
        <div className="flex items-start gap-2.5 rounded-xl bg-primary-light/50 border border-primary/10 p-3 text-xs leading-relaxed text-on-surface-muted">
          <AlertTriangle size={16} className="text-primary shrink-0 mt-0.5" />
          <p>
            Ausgewählte Zutaten werden automatisch von deiner **Vorratskammer** abgezogen. 
            Grundzutaten (Salz, Wasser etc.) sind standardmäßig deaktiviert.
          </p>
        </div>

        {/* Checklist */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1 border-t border-b border-border/60 py-3">
          {ingredients.map((ing, index) => {
            const key = `${ing.name}_${index}`;
            const isChecked = checkedIngredients[key];
            const matchingInvItem = inventoryItems.find(
              i => i.name.toLowerCase().trim() === ing.name.toLowerCase().trim()
            );
            const hasInInventory = !!matchingInvItem;
            
            // Check if there is a unit conversion mismatch
            const hasUnitMismatch = matchingInvItem && convert(ing.amount, ing.unit, matchingInvItem.unit) === null;

            return (
              <div 
                key={key} 
                onClick={() => toggleCheck(key)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  isChecked ? "bg-primary-light/35" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                    isChecked ? "bg-primary border-primary text-white" : "border-border bg-background"
                  }`}>
                    {isChecked && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${isChecked ? "text-on-surface" : "text-on-surface-muted"}`}>
                      {ing.name}
                    </span>
                    {hasUnitMismatch && (
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                        ⚠️ Einheit mismatch ({ing.unit} vs. {matchingInvItem.unit})
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-right">
                  <span className="text-[10px] font-bold text-on-surface bg-muted/60 px-2 py-0.5 rounded-full">
                    {formatAmount(ing.amount, ing.unit)}
                  </span>
                  {hasInInventory ? (
                    <span className="text-[9px] font-bold text-success uppercase tracking-wider">Im Vorrat</span>
                  ) : (
                    <span className="text-[9px] font-bold text-on-surface-muted uppercase tracking-wider">Kein Vorrat</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold hover:bg-muted cursor-pointer text-center"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover shadow-md cursor-pointer flex items-center justify-center gap-1.5 animate-pulse"
          >
            {isProcessing && <Loader className="h-3.5 w-3.5 text-white" />}
            <span>Bestätigen</span>
          </button>
        </div>

      </div>
    </div>
  );
}
