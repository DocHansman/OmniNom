import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  Clock, 
  User, 
  Trash2, 
  Edit3, 
  Play, 
  Calendar, 
  ArrowLeft,
  ChevronDown,
  X,
  ExternalLink
} from "lucide-react";

import { useRecipes } from "../hooks/useRecipes";
import { useMealPlan } from "../hooks/useMealPlan";
import StarRating from "../components/StarRating";
import NutritionDisplay from "../components/NutritionDisplay";
import UnitConverterWidget from "../components/UnitConverterWidget";
import { getServerUrl } from "../api/apiClient";
import { formatAmount } from "../utils/unitConverter";

const DAYS_OF_WEEK = [
  { label: "Montag", value: "Montag" },
  { label: "Dienstag", value: "Dienstag" },
  { label: "Mittwoch", value: "Mittwoch" },
  { label: "Donnerstag", value: "Donnerstag" },
  { label: "Freitag", value: "Freitag" },
  { label: "Samstag", value: "Samstag" },
  { label: "Sonntag", value: "Sonntag" }
];

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, deleteRecipe, scaleIngredients, saveRecipe } = useRecipes();
  const { addToMealPlan } = useMealPlan();

  const recipe = recipes.find(r => r.id === id);

  // Servings scale multiplier
  const [servingsScale, setServingsScale] = useState<number>(recipe ? recipe.servings : 2);

  // Unit Converter overlay state
  const [activeConverterIndex, setActiveConverterIndex] = useState<number | null>(null);

  // Meal Plan modal state
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<string>("Montag");
  const [planServings, setPlanServings] = useState<number>(recipe ? recipe.servings : 2);

  if (!recipe) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-on-surface p-4 text-center">
        <span className="text-3xl mb-2">🔍</span>
        <p className="font-bold">Rezept nicht gefunden</p>
        <p className="text-xs text-on-surface-muted mt-1">Dieses Rezept wurde möglicherweise gelöscht oder existiert nicht.</p>
        <Link to="/recipes" className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  // Update servingsScale if recipe loads later
  React.useEffect(() => {
    if (recipe) {
      setServingsScale(recipe.servings);
      setPlanServings(recipe.servings);
    }
  }, [recipe]);

  const handleDelete = async () => {
    if (window.confirm("Möchtest Du dieses Rezept wirklich löschen?")) {
      try {
        await deleteRecipe(recipe.id);
        navigate("/recipes");
      } catch (err) {
        console.error("Failed to delete recipe", err);
      }
    }
  };

  const handleRatingChange = async (newRating: number) => {
    try {
      await saveRecipe({
        ...recipe,
        rating: newRating
      });
    } catch (err) {
      console.error("Failed to update rating", err);
    }
  };

  const handleAddToPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // We represent the weekDate as a formatted string matching the weekday
      // In useMealPlan.ts, week_date is mapped to LocalDate format, so we can convert the selected day to an actual date offset.
      // For simplicity, let's map Montag-Sonntag to the current week's dates!
      const dateStr = getLocalDateForDay(selectedDay);

      await addToMealPlan({
        recipe_id: recipe.id,
        week_date: dateStr,
        servings: planServings
      });

      setIsPlanModalOpen(false);
      
      // Notify success
      const event = new CustomEvent("show-toast", { detail: { msg: `Rezept für ${selectedDay} geplant!`, type: "success" } });
      window.dispatchEvent(event);
    } catch (err) {
      console.error("Failed to plan recipe", err);
    }
  };

  // Maps Montag-Sonntag to the ISO dates (YYYY-MM-DD) of the current week
  const getLocalDateForDay = (day: string): string => {
    const daysOffset: Record<string, number> = {
      "Montag": 1, "Dienstag": 2, "Mittwoch": 3, "Donnerstag": 4, 
      "Freitag": 5, "Samstag": 6, "Sonntag": 7
    };
    
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // 1 = Mon, 7 = Sun
    const targetOffset = daysOffset[day];
    
    const diff = targetOffset - currentDay;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + diff);
    
    return targetDate.toISOString().split("T")[0]; // YYYY-MM-DD
  };

  const scaledIngredientsList = scaleIngredients(recipe.ingredients, recipe.servings, servingsScale);

  const serverUrl = getServerUrl();
  const photoUrl = recipe.photo_path 
    ? `${serverUrl}${recipe.photo_path.startsWith('/') ? '' : '/'}${recipe.photo_path}` 
    : null;

  return (
    <div className="relative pb-24 md:pb-12">
      
      {/* Upper Photo Header Banner */}
      <div className="relative aspect-video w-full max-h-72 bg-muted border-b border-border overflow-hidden">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-primary/10 via-primary-light/50 to-primary/5 text-primary/20">
            <span className="text-6xl">🍳</span>
          </div>
        )}

        {/* Back Button Overlay */}
        <button 
          onClick={() => navigate("/recipes")}
          className="absolute top-4 left-4 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs shadow-md transition-all cursor-pointer min-h-[48px] min-w-[48px] flex items-center justify-center"
        >
          <ArrowLeft size={22} />
        </button>
      </div>

      {/* Detail Content Wrapper */}
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        
        {/* Header Details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <StarRating rating={recipe.rating} onChange={handleRatingChange} size={22} interactive={true} />
            {recipe.source && (
              recipe.source.startsWith("http") ? (
                <a 
                  href={recipe.source}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-on-surface-muted bg-muted px-2.5 py-1 rounded-full flex items-center gap-1 hover:text-primary transition-colors max-w-[180px]"
                >
                  <span className="truncate">Quelle: {recipe.source}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <span className="text-xs font-bold text-on-surface-muted bg-muted px-2.5 py-1 rounded-full max-w-[180px] truncate">
                  Quelle: {recipe.source}
                </span>
              )
            )}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-on-surface leading-tight">
            {recipe.title}
          </h1>

          {/* Cooking Time & Original Servings */}
          <div className="flex gap-4 text-sm text-on-surface-muted font-extrabold">
            <span className="flex items-center gap-1.5">
              <Clock size={18} className="text-primary" />
              <span>{recipe.cookingTimeMinutes} Minuten</span>
            </span>
            <span className="flex items-center gap-1.5">
              <User size={18} className="text-primary" />
              <span>Original: {recipe.servings} Portionen</span>
            </span>
          </div>

          {/* Tags */}
          {recipe.dietaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {recipe.dietaryTags.map(tag => (
                <span 
                  key={tag} 
                  className="rounded-full bg-primary-light text-primary px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide border border-primary/5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Panel Row */}
        <div className="flex flex-wrap gap-2.5 border-t border-b border-border/60 py-4">
          <button
            onClick={() => navigate(`/cooking/${recipe.id}`, { state: { servings: servingsScale } })}
            className="flex-1 min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-extrabold text-white hover:bg-primary-hover shadow-md active:scale-98 transition-all cursor-pointer text-sm"
          >
            <Play size={18} fill="white" />
            <span>Kochen starten</span>
          </button>

          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-extrabold hover:bg-muted active:scale-98 transition-all cursor-pointer"
          >
            <Calendar size={18} className="text-primary" />
            <span>Planen</span>
          </button>

          <button
            onClick={() => navigate(`/recipe/${recipe.id}/edit`)}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface hover:bg-muted active:scale-98 transition-all cursor-pointer"
            title="Bearbeiten"
          >
            <Edit3 size={18} className="text-on-surface-muted" />
          </button>

          <button
            onClick={handleDelete}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface hover:bg-error/5 text-error active:scale-98 transition-all cursor-pointer"
            title="Löschen"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Portion Controller & Ingredients list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Zutaten</h3>
            
            {/* Scale adjustment +/- buttons */}
            <div className="flex items-center h-12 border border-border rounded-xl bg-muted/40 overflow-hidden text-xs">
              <span className="px-3 font-bold text-on-surface-muted h-full flex items-center">Menge für:</span>
              <button 
                onClick={() => setServingsScale(s => Math.max(1, s - 1))}
                className="w-12 h-full hover:bg-muted border-l border-border font-extrabold cursor-pointer text-lg flex items-center justify-center"
              >
                -
              </button>
              <span className="px-3.5 font-extrabold text-on-surface text-sm h-full flex items-center">{servingsScale} Port.</span>
              <button 
                onClick={() => setServingsScale(s => s + 1)}
                className="w-12 h-full hover:bg-muted border-l border-border font-extrabold cursor-pointer text-lg flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <ul className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border/50 shadow-xs">
            {scaledIngredientsList.map((ing, idx) => (
              <li 
                key={idx} 
                className="relative px-4 py-3.5 flex justify-between items-center text-sm font-semibold hover:bg-muted/15"
              >
                <span className="text-on-surface text-base font-medium">{ing.name}</span>
                
                {/* Clickable quantity to trigger unit converter widget */}
                <div>
                  <button
                    onClick={() => setActiveConverterIndex(activeConverterIndex === idx ? null : idx)}
                    className="font-bold text-primary bg-primary-light/50 border border-primary/5 px-3 py-1.5 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all text-sm text-right shrink-0 min-h-[36px] flex items-center justify-center"
                  >
                    {formatAmount(ing.amount, ing.unit)}
                  </button>

                  {/* Unit converter widget popover overlay */}
                  {activeConverterIndex === idx && (
                    <div className="right-4">
                      <UnitConverterWidget
                        amount={ing.amount}
                        unit={ing.unit}
                        onClose={() => setActiveConverterIndex(null)}
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Scaled Macro Nutrition Card */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-muted">Nährwerte ({servingsScale} Portionen)</h3>
          <NutritionDisplay 
            nutrition={recipe.nutrition} 
            servings={servingsScale} 
            originalServings={recipe.servings} 
          />
        </div>

        {/* Steps Preview List */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Zubereitungsschritte</h3>
          <div className="space-y-4">
            {recipe.steps.map((step) => (
              <div key={step.order} className="flex gap-3.5 items-start">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary text-xs font-bold mt-0.5">
                  {step.order}
                </div>
                <div className="text-sm leading-relaxed text-on-surface-muted font-medium">
                  {step.description}
                  {step.timerMinutes && (
                    <span className="inline-flex items-center gap-1.5 ml-1.5 px-2.5 py-0.5 rounded-full bg-muted font-bold text-xs text-primary">
                      ⏱️ {step.timerMinutes} Min.
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* --- PLANNER ADD MODAL DIALOG --- */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-scale-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col gap-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-1.5">
                <Calendar size={20} className="text-primary" /> Rezept einplanen
              </h3>
              <button 
                onClick={() => setIsPlanModalOpen(false)} 
                className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddToPlanSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-muted uppercase">Wochentag auswählen</label>
                <div className="relative">
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="w-full h-12 appearance-none rounded-xl border border-border bg-background pr-10 pl-4 text-sm font-semibold focus:border-primary focus:outline-none"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3.5 top-4 text-on-surface-muted pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-muted uppercase">Portionen einplanen</label>
                <div className="flex items-center h-12 border border-border rounded-xl bg-background overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPlanServings(s => Math.max(1, s - 1))}
                    className="w-12 h-full text-base hover:bg-muted font-bold cursor-pointer flex items-center justify-center"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={planServings}
                    onChange={(e) => setPlanServings(Math.max(1, parseInt(e.target.value) || 2))}
                    className="w-full border-none bg-transparent text-center text-sm font-semibold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPlanServings(s => s + 1)}
                    className="w-12 h-full text-base hover:bg-muted font-bold cursor-pointer flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="flex-1 h-12 rounded-xl border border-border text-sm font-bold hover:bg-muted cursor-pointer text-center flex items-center justify-center"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="flex-1 h-12 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary-hover shadow-md cursor-pointer flex items-center justify-center"
                >
                  Einplanen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
