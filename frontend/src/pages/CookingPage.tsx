import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  AlertCircle,
  Clock,
  ArrowLeft,
  X
} from "lucide-react";

import { useRecipes, Ingredient } from "../hooks/useRecipes";
import IngredientConsumptionDialog from "../components/IngredientConsumptionDialog";
import { formatAmount } from "../utils/unitConverter";

export default function CookingPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { recipes, scaleIngredients } = useRecipes();

  // Selected Recipe
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(id || null);
  const recipe = recipes.find(r => r.id === selectedRecipeId);

  // Scaled Servings
  const servings = location.state?.servings || (recipe ? recipe.servings : 2);
  const scaledIngredients = recipe ? scaleIngredients(recipe.ingredients, recipe.servings, servings) : [];

  // Stepper State
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  
  // Timer States
  const [timerRemaining, setTimerRemaining] = useState<number>(0); // in seconds
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const timerIntervalRef = useRef<any>(null);
  const timerEndTimeRef = useRef<number | null>(null);

  // WakeLock States
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [showWakeLockWarning, setShowWakeLockWarning] = useState<boolean>(false);

  // End Dialog state
  const [showConsumptionDialog, setShowConsumptionDialog] = useState<boolean>(false);

  // 1. Initialise WakeLock for Android/Chrome
  useEffect(() => {
    if (!selectedRecipeId || !recipe) return;

    async function requestWakeLock() {
      if ("wakeLock" in navigator) {
        try {
          const lock = await (navigator as any).wakeLock.request("screen");
          setWakeLock(lock);
          setShowWakeLockWarning(false);
          console.log("Screen WakeLock acquired successfully.");
        } catch (err) {
          console.warn("WakeLock request failed", err);
          setShowWakeLockWarning(true);
        }
      } else {
        // iOS Safari fallback
        setShowWakeLockWarning(true);
      }
    }
    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => {
          console.log("Screen WakeLock released.");
        });
      }
    };
  }, [selectedRecipeId, recipe]);

  // Re-acquire WakeLock on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === "visible") {
        try {
          const lock = await (navigator as any).wakeLock.request("screen");
          setWakeLock(lock);
        } catch (e) {
          console.warn("Failed to re-acquire WakeLock on visibility change", e);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [wakeLock]);

  // 2. Timer Countdown Logic (protected from background throttling)
  useEffect(() => {
    const currentStep = recipe?.steps[activeStepIndex];
    
    // Stop any running timer and reset when step changes
    stopTimer();
    
    if (currentStep && currentStep.timerMinutes) {
      setTimerRemaining(currentStep.timerMinutes * 60);
    } else {
      setTimerRemaining(0);
    }

    return () => stopTimer();
  }, [activeStepIndex, selectedRecipeId]);

  const startTimer = () => {
    if (isTimerRunning) return;
    
    // Set absolute end timestamp to protect against background drift
    timerEndTimeRef.current = Date.now() + timerRemaining * 1000;
    setIsTimerRunning(true);

    timerIntervalRef.current = setInterval(() => {
      if (timerEndTimeRef.current) {
        const remaining = Math.max(0, Math.round((timerEndTimeRef.current - Date.now()) / 1000));
        setTimerRemaining(remaining);

        if (remaining === 0) {
          // Timer finished!
          stopTimer();
          triggerAlarm();
        }
      }
    }, 200);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsTimerRunning(false);
  };

  const resetTimer = () => {
    stopTimer();
    const currentStep = recipe?.steps[activeStepIndex];
    if (currentStep && currentStep.timerMinutes) {
      setTimerRemaining(currentStep.timerMinutes * 60);
    }
  };

  const triggerAlarm = () => {
    // 1. Haptic Vibration Feedback
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
    // 2. Visual alert pulse triggers automatically due to timerRemaining === 0 check in render
    console.log("Timer completed alarm triggered!");
  };

  // Helper formatting seconds -> MM:SS
  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // 3. Proactive UX: Smart ingredient keyword filtering for active step
  const getIngredientsForStep = (description: string, allIngredients: Ingredient[]) => {
    const descLower = description.toLowerCase();
    
    return allIngredients.filter(ing => {
      const ingNameClean = ing.name.toLowerCase().trim();
      
      // Direct substring match
      if (descLower.includes(ingNameClean)) return true;

      // Match parts of ingredient names (e.g. "rote Zwiebeln" -> Zwiebeln)
      const parts = ingNameClean.split(/\s+/).filter(p => p.length > 2);
      return parts.some(part => descLower.includes(part));
    });
  };

  // ----------------------------------------------------
  // RECIPE SELECTOR (if accessed directly from menu)
  // ----------------------------------------------------
  if (!selectedRecipeId || !recipe) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <div className="flex flex-col gap-1.5 border-b border-border pb-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Kochmodus starten</h2>
          <p className="text-sm text-on-surface-muted">Wähle ein Rezept aus Deinem Kochbuch aus.</p>
        </div>

        {recipes.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border rounded-2xl bg-surface/50">
            <p className="font-bold text-base text-on-surface">Keine Rezepte vorhanden.</p>
            <Link to="/recipes" className="text-sm text-primary font-bold mt-1.5 inline-block">Rezept hinzufügen &rarr;</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recipes.map(r => (
              <div 
                key={r.id}
                onClick={() => setSelectedRecipeId(r.id)}
                className="flex items-center justify-between p-5 rounded-2xl border border-border bg-surface hover:border-primary/40 cursor-pointer shadow-xs transition-all hover:scale-[1.01]"
              >
                <div>
                  <h4 className="text-base font-bold text-on-surface">{r.title}</h4>
                  <p className="text-xs text-on-surface-muted font-bold mt-1">{r.cookingTimeMinutes} Min. | {r.servings} Port.</p>
                </div>
                <ChevronRight size={18} className="text-on-surface-muted" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const currentStep = recipe.steps[activeStepIndex];
  const stepIngredients = getIngredientsForStep(currentStep.description, scaledIngredients);

  const handleNext = () => {
    if (activeStepIndex < recipe.steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    } else {
      // Completed last step! Open stock depletion dialog
      setShowConsumptionDialog(true);
    }
  };

  const handleBack = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      
      {/* iOS WakeLock fallback warning banner */}
      {showWakeLockWarning && (
        <div className="bg-primary-light border-b border-primary/20 px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed text-on-surface font-semibold shrink-0">
          <AlertCircle size={18} className="text-primary shrink-0 mt-0.5" />
          <p className="flex-1">
            <strong>iOS-Wachbleiben nicht verfügbar:</strong> Tippe unter Einstellungen &rarr; Anzeige & Helligkeit &rarr; Automatische Sperre &rarr; <strong>Nie</strong>, damit der Bildschirm beim Kochen an bleibt.
          </p>
          <button onClick={() => setShowWakeLockWarning(false)} className="text-on-surface-muted hover:text-on-surface ml-2 p-1 rounded-lg hover:bg-primary-light-hover">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Grid Layout Container */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* DESKTOP SIDEBAR STEP LIST TIMELINE */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-surface overflow-y-auto px-4 py-6">
          <button 
            onClick={() => navigate(`/recipe/${recipe.id}`)}
            className="flex items-center gap-2 text-xs font-bold text-on-surface-muted hover:text-on-surface mb-6 border-b border-border pb-4 shrink-0 cursor-pointer min-h-[44px]"
          >
            <ArrowLeft size={16} />
            <span>Zurück zum Rezept</span>
          </button>
          
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-muted mb-4 px-2 shrink-0">Zubereitungsschritte</h3>
          
          {/* Vertical Stepper connectors */}
          <div className="relative pl-8 space-y-6 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
            {recipe.steps.map((step, idx) => {
              const isActive = idx === activeStepIndex;
              const isPast = idx < activeStepIndex;

              return (
                <div 
                  key={step.order} 
                  onClick={() => setActiveStepIndex(idx)}
                  className="relative flex items-start gap-3 cursor-pointer group select-none"
                >
                  {/* Circle Node */}
                  <div className={`absolute -left-9 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold z-10 transition-colors ${
                    isActive 
                      ? "bg-primary border-primary text-white ring-4 ring-primary-light" 
                      : isPast
                        ? "bg-success border-success text-white"
                        : "bg-surface border-border text-on-surface-muted group-hover:border-on-surface-muted"
                  }`}>
                    {isPast ? <Check size={12} strokeWidth={3} /> : step.order}
                  </div>
                  
                  {/* Step Brief text */}
                  <span className={`text-xs font-bold leading-tight line-clamp-2 ${
                    isActive ? "text-primary font-extrabold" : "text-on-surface-muted group-hover:text-on-surface"
                  }`}>
                    {step.description}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAIN STEP PANELS CONTROLLER */}
        <section className="flex-1 flex flex-col overflow-y-auto p-4 md:p-8 justify-between gap-6">
          
          {/* Top layout headers */}
          <div className="space-y-4">
            {/* Mobile Horizontal progress indicators */}
            <div className="flex gap-1 md:hidden">
              {recipe.steps.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    idx === activeStepIndex 
                      ? "bg-primary" 
                      : idx < activeStepIndex 
                        ? "bg-success" 
                        : "bg-border dark:bg-muted"
                  }`}
                />
              ))}
            </div>

            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Kochmodus</span>
                <h2 className="text-xl font-extrabold text-on-surface leading-tight mt-1">{recipe.title}</h2>
              </div>
              
              {/* Back to Recipe details on mobile */}
              <button 
                onClick={() => navigate(`/recipe/${recipe.id}`)}
                className="md:hidden p-2 text-on-surface-muted hover:text-on-surface flex items-center justify-center cursor-pointer rounded-xl hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Active Step Panel */}
          <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full gap-6">
            
            {/* Step Description */}
            <div className="space-y-3">
              <span className="text-sm font-bold text-on-surface-muted uppercase tracking-wider">Schritt {currentStep.order} von {recipe.steps.length}</span>
              <p className="text-2xl font-bold leading-relaxed text-on-surface md:text-3xl">
                {currentStep.description}
              </p>
            </div>

            {/* Smart Step Ingredients filtered */}
            {stepIngredients.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface/50 p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Zutaten für diesen Schritt</h4>
                <div className="flex flex-wrap gap-2">
                  {stepIngredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-xl bg-surface border border-border px-3.5 py-2 text-sm font-bold shadow-2xs min-h-[40px]">
                      <span>{ing.name}:</span>
                      <span className="text-primary font-extrabold">{formatAmount(ing.amount, ing.unit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timer Widget */}
            {currentStep.timerMinutes && (
              <div className={`rounded-2xl border bg-surface p-5 shadow-sm flex items-center justify-between gap-4 max-w-md mx-auto w-full transition-all ${
                timerRemaining === 0 ? "border-primary animate-pulse shadow-primary/20 ring-4 ring-primary-light" : "border-border"
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`p-3.5 rounded-full ${timerRemaining === 0 ? "bg-primary text-white" : "bg-muted text-primary"}`}>
                    <Clock size={24} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-on-surface-muted uppercase tracking-wider">Timer</div>
                    <div className={`text-2xl font-black tracking-tight mt-0.5 ${timerRemaining === 0 ? "text-primary animate-bounce" : ""}`}>
                      {formatTime(timerRemaining)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={isTimerRunning ? stopTimer : startTimer}
                    className={`h-12 w-12 flex items-center justify-center rounded-xl text-white shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                      isTimerRunning ? "bg-secondary" : "bg-primary"
                    }`}
                    title={isTimerRunning ? "Pause" : "Start"}
                  >
                    {isTimerRunning ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" className="ml-0.5" />}
                  </button>
                  <button 
                    onClick={resetTimer}
                    className="h-12 w-12 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-muted active:scale-95 transition-all cursor-pointer text-on-surface-muted"
                    title="Reset"
                  >
                    <RotateCcw size={20} />
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Stepper Navigation buttons row */}
          <div className="flex gap-4 border-t border-border/50 pt-4 shrink-0 max-w-xl mx-auto w-full">
            <button
              onClick={handleBack}
              disabled={activeStepIndex === 0}
              className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl border border-border text-sm font-extrabold hover:bg-muted active:scale-95 transition-all cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft size={20} />
              <span>Zurück</span>
            </button>

            <button
              onClick={handleNext}
              className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold text-white hover:bg-primary-hover shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span>{activeStepIndex === recipe.steps.length - 1 ? "Fertig" : "Weiter"}</span>
              <ChevronRight size={20} />
            </button>
          </div>

        </section>

      </div>

      {/* --- INVENTORY STOCK DEPLETION MODAL DIALOG --- */}
      {showConsumptionDialog && (
        <IngredientConsumptionDialog
          recipeTitle={recipe.title}
          ingredients={scaledIngredients}
          onConfirm={() => {
            setShowConsumptionDialog(false);
            navigate(`/recipe/${recipe.id}`);
          }}
          onClose={() => setShowConsumptionDialog(false)}
        />
      )}

    </div>
  );
}
