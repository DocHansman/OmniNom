import { useState } from "react";
import { Link } from "react-router-dom";
import RecipeSuggester from "../components/RecipeSuggester";
import { 
  Trash2, 
  User, 
  Sparkles, 
  BookOpen, 
  Plus,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

import { useMealPlan } from "../hooks/useMealPlan";
import { useRecipes } from "../hooks/useRecipes";
import { useShoppingList } from "../hooks/useShoppingList";
import Loader from "../components/Loader";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function getStartOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  // Adjust when day is Sunday (getDay() returns 0)
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function MealPlanPage() {
  const { mealPlan, removeFromMealPlan } = useMealPlan();
  const { recipes } = useRecipes();
  const { calculateShoppingNeeds } = useShoppingList();

  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [isSuggesterOpen, setIsSuggesterOpen] = useState<boolean>(false);

  // Week pivot date (default to Monday of current week)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));

  // Navigation handlers
  const handlePrevWeek = () => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const handleCurrentWeek = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
  };

  // Get Monday to Sunday Dates for currently selected week
  const getWeekDates = (): Date[] => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const weekDateStrings = weekDates.map(formatLocalDate);

  // Filter meal plan to only show items in the currently viewed week
  const currentWeekMealPlans = mealPlan.filter((plan) =>
    weekDateStrings.includes(plan.week_date)
  );

  const getWeekRangeLabel = (): string => {
    const start = currentWeekStart;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    
    const startStr = start.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
    const endStr = end.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" });
    return `Woche vom ${startStr}. bis ${endStr}`;
  };

  // Calculate total weekly calories for the currently viewed week
  const calculateTotalWeeklyCalories = (): number => {
    let total = 0;
    for (const plan of currentWeekMealPlans) {
      const recipe = recipes.find(r => r.id === plan.recipe_id);
      if (recipe && recipe.nutrition.caloriesPerServing > 0) {
        total += recipe.nutrition.caloriesPerServing * plan.servings;
      }
    }
    return Math.round(total);
  };

  const handleCalculateGaps = async () => {
    setIsCalculating(true);
    try {
      // Trigger E2EE gap calculation ONLY for the selected week
      await calculateShoppingNeeds(recipes, currentWeekMealPlans);
      
      const event = new CustomEvent("show-toast", { 
        detail: { msg: "Einkaufsbedarf für diese Woche ermittelt und Liste aktualisiert!", type: "success" } 
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCalculating(false);
    }
  };

  const weeklyCalories = calculateTotalWeeklyCalories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8 space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-on-surface">Wochenplaner</h2>
          <p className="text-xs text-on-surface-muted">Plane deine Mahlzeiten und generiere die Einkaufsliste.</p>
        </div>

        <div className="flex flex-wrap gap-2 sm:items-center">
          {/* KI Wochenplaner trigger button */}
          <button
            onClick={() => setIsSuggesterOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 px-4 py-2.5 text-xs font-extrabold text-primary transition-all cursor-pointer"
          >
            <Sparkles size={14} />
            <span>KI Wochenplaner</span>
          </button>

          {currentWeekMealPlans.length > 0 && (
            <button
              onClick={handleCalculateGaps}
              disabled={isCalculating}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isCalculating ? (
                <Loader className="h-3.5 w-3.5 text-white" />
              ) : (
                <Sparkles size={14} />
              )}
              <span>Bedarf berechnen</span>
            </button>
          )}
        </div>
      </div>

      {/* Week Navigation Selector */}
      <div className="flex items-center justify-between bg-surface border border-border p-3.5 rounded-2xl shadow-2xs">
        <button 
          onClick={handlePrevWeek} 
          className="p-1.5 rounded-xl hover:bg-muted text-on-surface-muted hover:text-on-surface cursor-pointer transition-colors"
          title="Vorherige Woche"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-extrabold text-on-surface">{getWeekRangeLabel()}</span>
          <button 
            onClick={handleCurrentWeek}
            className="text-[9px] font-bold text-primary hover:underline mt-0.5"
          >
            Zur aktuellen Woche
          </button>
        </div>
        <button 
          onClick={handleNextWeek} 
          className="p-1.5 rounded-xl hover:bg-muted text-on-surface-muted hover:text-on-surface cursor-pointer transition-colors"
          title="Nächste Woche"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Week overview statistics summary */}
      {currentWeekMealPlans.length > 0 && (
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-4 shadow-2xs">
          <div>
            <div className="text-[10px] font-bold text-on-surface-muted uppercase tracking-wider">Geplante Gerichte (Woche)</div>
            <div className="text-lg font-extrabold text-on-surface mt-0.5">{currentWeekMealPlans.length}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-on-surface-muted uppercase tracking-wider">Gesamtkalorien (Woche)</div>
            <div className="text-lg font-extrabold text-primary mt-0.5">
              {weeklyCalories > 0 ? `${weeklyCalories.toLocaleString("de-DE")} kcal` : "Keine Angaben"}
            </div>
          </div>
        </div>
      )}

      {/* Weekday List slots */}
      <div className="space-y-3">
        {weekDates.map((date, idx) => {
          const dateStr = formatLocalDate(date);
          const dayName = WEEKDAYS[idx];
          const formattedLabel = date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });

          // Find all slots planned for this specific date
          const dayPlans = mealPlan.filter(plan => plan.week_date === dateStr);

          return (
            <div 
              key={dateStr} 
              className={`rounded-2xl border bg-surface overflow-hidden transition-colors ${
                dayPlans.length > 0 ? "border-primary/20 bg-primary-light/5" : "border-border"
              }`}
            >
              {/* Day title row */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold tracking-wide text-on-surface uppercase">{dayName}</span>
                  <span className="text-[10px] font-bold text-on-surface-muted bg-muted px-2 py-0.5 rounded-md">{formattedLabel}</span>
                </div>
                {dayPlans.length === 0 && (
                  <Link
                    to="/recipes"
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-hover transition-colors"
                  >
                    <Plus size={12} />
                    <span>Hinzufügen</span>
                  </Link>
                )}
              </div>

              {/* Day planned recipes */}
              {dayPlans.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-on-surface-muted italic">
                  Keine Mahlzeit geplant
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {dayPlans.map((plan) => {
                    const recipe = recipes.find(r => r.id === plan.recipe_id);
                    
                    return (
                      <div key={plan.id} className="p-4 flex justify-between items-center gap-4 text-xs font-semibold">
                        <div className="flex-1 space-y-1.5">
                          {recipe ? (
                            <Link 
                              to={`/recipe/${recipe.id}`}
                              className="font-bold text-on-surface hover:text-primary transition-colors flex items-center gap-1"
                            >
                              <BookOpen size={14} className="text-primary/70 shrink-0" />
                              <span className="line-clamp-1">{recipe.title}</span>
                            </Link>
                          ) : (
                            <span className="font-bold text-on-surface flex items-center gap-1 text-on-surface-muted">
                              <BookOpen size={14} className="shrink-0" />
                              <span>Unbekanntes Rezept</span>
                            </span>
                          )}
                          
                          <div className="flex items-center gap-3 text-[10px] text-on-surface-muted font-bold">
                            <span className="flex items-center gap-0.5">
                              <User size={12} /> {plan.servings} Portionen
                            </span>
                            {recipe && recipe.nutrition.caloriesPerServing > 0 && (
                              <span>• {Math.round(recipe.nutrition.caloriesPerServing * plan.servings)} kcal gesamt</span>
                            )}
                          </div>
                        </div>

                        {/* Delete slot button */}
                        <button
                          onClick={() => removeFromMealPlan(plan.id)}
                          className="p-2 rounded-lg text-error hover:bg-error/5 cursor-pointer shrink-0 transition-colors"
                          title="Planung entfernen"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recipe Suggester Modal */}
      <RecipeSuggester isOpen={isSuggesterOpen} onClose={() => setIsSuggesterOpen(false)} initialDaysCount={3} />
    </div>
  );
}
