import { Nutrition } from "../hooks/useRecipes";

interface NutritionDisplayProps {
  nutrition: Nutrition;
  servings: number;
  originalServings?: number;
}

export default function NutritionDisplay({ 
  nutrition, 
  servings,
  originalServings = 1 
}: NutritionDisplayProps) {
  const factor = servings / originalServings;

  const calories = Math.round((nutrition.caloriesPerServing || 0) * factor);
  const protein = parseFloat(((nutrition.proteinG || 0) * factor).toFixed(1));
  const fat = parseFloat(((nutrition.fatG || 0) * factor).toFixed(1));
  const carbs = parseFloat(((nutrition.carbsG || 0) * factor).toFixed(1));

  // Calculate macro percentage weights for the distribution bar
  const totalGrams = protein + fat + carbs;
  const proteinPercent = totalGrams > 0 ? (protein / totalGrams) * 100 : 0;
  const fatPercent = totalGrams > 0 ? (fat / totalGrams) * 100 : 0;
  const carbsPercent = totalGrams > 0 ? (carbs / totalGrams) * 100 : 0;

  const hasNutrition = calories > 0 || totalGrams > 0;

  if (!hasNutrition) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-on-surface-muted">
        Keine Nährwertangaben vorhanden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards Grid */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-primary-light/40 border border-primary/10 p-3 text-center">
          <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Kcal</div>
          <div className="text-base font-extrabold tracking-tight mt-0.5">{calories}</div>
        </div>
        <div className="rounded-xl bg-success/5 border border-success/10 p-3 text-center">
          <div className="text-[10px] font-bold text-success uppercase tracking-wider">Eiweiß</div>
          <div className="text-base font-extrabold tracking-tight mt-0.5">{protein}g</div>
        </div>
        <div className="rounded-xl bg-warning/5 border border-warning/10 p-3 text-center">
          <div className="text-[10px] font-bold text-warning uppercase tracking-wider">Fett</div>
          <div className="text-base font-extrabold tracking-tight mt-0.5">{fat}g</div>
        </div>
        <div className="rounded-xl bg-secondary/5 border border-secondary/10 p-3 text-center">
          <div className="text-[10px] font-bold text-secondary uppercase tracking-wider">Carbs</div>
          <div className="text-base font-extrabold tracking-tight mt-0.5">{carbs}g</div>
        </div>
      </div>

      {/* Macro Ratio Distribution Bar */}
      {totalGrams > 0 && (
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted">
            <div 
              style={{ width: `${proteinPercent}%` }} 
              className="bg-success h-full transition-all duration-300"
              title={`Eiweiß: ${proteinPercent.toFixed(0)}%`}
            />
            <div 
              style={{ width: `${fatPercent}%` }} 
              className="bg-warning h-full transition-all duration-300"
              title={`Fett: ${fatPercent.toFixed(0)}%`}
            />
            <div 
              style={{ width: `${carbsPercent}%` }} 
              className="bg-primary h-full transition-all duration-300"
              title={`Kohlenhydrate: ${carbsPercent.toFixed(0)}%`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-muted font-bold px-1">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Eiweiß ({proteinPercent.toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Fett ({fatPercent.toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Carbs ({carbsPercent.toFixed(0)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
