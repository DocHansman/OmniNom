import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft, 
  Type, 
  Link as LinkIcon,
  Sparkles
} from "lucide-react";

import { useRecipes, Ingredient, Step, Nutrition } from "../hooks/useRecipes";
import PhotoCapture from "./PhotoCapture";
import DietaryTagPicker from "./DietaryTagPicker";
import StarRating from "./StarRating";
import { apiFetch, getServerUrl } from "../api/apiClient";
import { SUPPORTED_UNITS } from "../utils/unitConverter";
import Loader from "./Loader";

interface EditableIngredient extends Ingredient {
  keyId: string;
}

interface EditableStep extends Step {
  keyId: string;
}

export default function RecipeEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { recipes, saveRecipe, isSaving } = useRecipes();

  const isEditMode = !!id;

  // Form states
  const [title, setTitle] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [servings, setServings] = useState<number>(2);
  const [cookingTime, setCookingTime] = useState<number>(30);
  const [rating, setRating] = useState<number | null>(null);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  
  // Dynamic lists
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([{ keyId: window.crypto.randomUUID(), name: "", amount: 0, unit: "g" }]);
  const [steps, setSteps] = useState<EditableStep[]>([{ keyId: window.crypto.randomUUID(), order: 1, description: "", timerMinutes: null }]);
  
  // Macros
  const [calories, setCalories] = useState<number>(0);
  const [protein, setProtein] = useState<number>(0);
  const [fat, setFat] = useState<number>(0);
  const [carbs, setCarbs] = useState<number>(0);

  // File to upload on save
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>("");

  // AI generation states
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);

  const handleGenerateImage = async () => {
    if (!title.trim()) {
      const event = new CustomEvent("show-toast", { detail: { msg: "Bitte gib zuerst einen Rezepttitel an.", type: "error" } });
      window.dispatchEvent(event);
      return;
    }
    
    setIsGeneratingImage(true);
    try {
      const cleanIngredients = ingredients.map(i => i.name.trim()).filter(name => name.length > 0);
      const response = await apiFetch("/api/recipe/generate-image", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          ingredients: cleanIngredients
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.photo_path) {
          setPhotoPath(data.photo_path);
          setPhotoFile(null); // Clear manual upload file
          const event = new CustomEvent("show-toast", { detail: { msg: "Rezeptbild erfolgreich mit KI generiert!", type: "success" } });
          window.dispatchEvent(event);
        }
      } else {
        const err = await response.text();
        const event = new CustomEvent("show-toast", { detail: { msg: err || "Bildgenerierung fehlgeschlagen.", type: "error" } });
        window.dispatchEvent(event);
      }
    } catch (err) {
      console.error(err);
      const event = new CustomEvent("show-toast", { detail: { msg: "Verbindungsfehler bei der Bildgenerierung.", type: "error" } });
      window.dispatchEvent(event);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleEnrichRecipe = async () => {
    if (!title.trim()) {
      const event = new CustomEvent("show-toast", { detail: { msg: "Bitte gib zuerst einen Rezepttitel an.", type: "error" } });
      window.dispatchEvent(event);
      return;
    }
    
    setIsEnriching(true);
    try {
      const cleanIngredients = ingredients.filter(i => i.name.trim().length > 0).map(({ keyId, ...rest }) => rest);
      const cleanSteps = steps.filter(s => s.description.trim().length > 0).map(({ keyId, ...rest }) => rest);
      
      const response = await apiFetch("/api/recipe/enrich", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          ingredients: cleanIngredients,
          steps: cleanSteps
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.servings) setServings(data.servings);
        if (data.cookingTimeMinutes) setCookingTime(data.cookingTimeMinutes);
        if (data.dietaryTags) setDietaryTags(data.dietaryTags);
        if (data.nutrition) {
          if (data.nutrition.caloriesPerServing) setCalories(data.nutrition.caloriesPerServing);
          if (data.nutrition.proteinG) setProtein(data.nutrition.proteinG);
          if (data.nutrition.fatG) setFat(data.nutrition.fatG);
          if (data.nutrition.carbsG) setCarbs(data.nutrition.carbsG);
        }
        const event = new CustomEvent("show-toast", { detail: { msg: "Rezeptinformationen erfolgreich ergänzt!", type: "success" } });
        window.dispatchEvent(event);
      } else {
        const err = await response.text();
        const event = new CustomEvent("show-toast", { detail: { msg: err || "Rezeptergänzung fehlgeschlagen.", type: "error" } });
        window.dispatchEvent(event);
      }
    } catch (err) {
      console.error(err);
      const event = new CustomEvent("show-toast", { detail: { msg: "Verbindungsfehler bei der Rezeptergänzung.", type: "error" } });
      window.dispatchEvent(event);
    } finally {
      setIsEnriching(false);
    }
  };

  // Load recipe details if editing or prefilled from scanner/scraper
  useEffect(() => {
    if (isEditMode && id) {
      const existing = recipes.find(r => r.id === id);
      if (existing) {
        setTitle(existing.title);
        setSource(existing.source);
        setServings(existing.servings);
        setCookingTime(existing.cookingTimeMinutes);
        setRating(existing.rating);
        setDietaryTags(existing.dietaryTags);
        setPhotoPath(existing.photo_path);
        setIngredients(existing.ingredients.length > 0 ? existing.ingredients.map(i => ({ ...i, keyId: window.crypto.randomUUID() })) : [{ keyId: window.crypto.randomUUID(), name: "", amount: 0, unit: "g" }]);
        setSteps(existing.steps.length > 0 ? existing.steps.map(s => ({ ...s, keyId: window.crypto.randomUUID() })) : [{ keyId: window.crypto.randomUUID(), order: 1, description: "", timerMinutes: null }]);
        setCalories(existing.nutrition.caloriesPerServing || 0);
        setProtein(existing.nutrition.proteinG || 0);
        setFat(existing.nutrition.fatG || 0);
        setCarbs(existing.nutrition.carbsG || 0);
      }
    } else {
      // Check if there is prefilledData in location.state or draft in sessionStorage
      const draftStr = sessionStorage.getItem("omninom_recipe_draft");
      let data: any = null;
      if (location.state?.prefilledData) {
        data = location.state.prefilledData;
      } else if (draftStr) {
        try {
          data = JSON.parse(draftStr);
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      if (data) {
        setTitle(data.title || "");
        setSource(data.source || "");
        setServings(data.servings || 2);
        setCookingTime(data.cookingTimeMinutes || data.cookingTime || 30);
        setDietaryTags(data.dietaryTags || []);
        setIngredients(data.ingredients?.length > 0 ? data.ingredients.map((ing: any) => ({ ...ing, keyId: window.crypto.randomUUID() })) : [{ keyId: window.crypto.randomUUID(), name: "", amount: 0, unit: "g" }]);
        setSteps(data.steps?.length > 0 ? data.steps.map((step: any) => ({ ...step, keyId: window.crypto.randomUUID() })) : [{ keyId: window.crypto.randomUUID(), order: 1, description: "", timerMinutes: null }]);
        setCalories(data.nutrition?.caloriesPerServing || data.calories || 0);
        setProtein(data.nutrition?.proteinG || data.protein || 0);
        setFat(data.nutrition?.fatG || data.fat || 0);
        setCarbs(data.nutrition?.carbsG || data.carbs || 0);
        setPhotoPath(data.photo_path || data.photoPath || null);
        
        if (location.state?.prefilledData) {
          // Flash verification toast
          const event = new CustomEvent("show-toast", { detail: { msg: "Rezeptdaten eingetragen – bitte überprüfen", type: "success" } });
          window.dispatchEvent(event);
        }
      }
    }
  }, [isEditMode, id, recipes, location.state]);

  // Save draft to sessionStorage
  useEffect(() => {
    if (!isEditMode) {
      const draft = {
        title,
        source,
        servings,
        cookingTime,
        rating,
        dietaryTags,
        ingredients: ingredients.map(({ keyId, ...rest }) => rest),
        steps: steps.map(({ keyId, ...rest }) => rest),
        nutrition: {
          caloriesPerServing: calories,
          proteinG: protein,
          fatG: fat,
          carbsG: carbs
        },
        photoPath
      };
      sessionStorage.setItem("omninom_recipe_draft", JSON.stringify(draft));
    }
  }, [isEditMode, title, source, servings, cookingTime, rating, dietaryTags, ingredients, steps, calories, protein, fat, carbs, photoPath]);

  // ----------------------------------------------------
  // DYNAMIC LIST OPERATIONS
  // ----------------------------------------------------
  
  // Ingredients
  const addIngredientRow = () => {
    setIngredients([...ingredients, { keyId: window.crypto.randomUUID(), name: "", amount: 0, unit: "g" }]);
  };

  const removeIngredientRow = (keyId: string) => {
    setIngredients(ingredients.filter((ing) => ing.keyId !== keyId));
  };

  const handleIngredientChange = (keyId: string, field: keyof Ingredient, val: any) => {
    setIngredients(prev => prev.map(ing => {
      if (ing.keyId !== keyId) return ing;
      if (field === "amount") {
        return { ...ing, amount: parseFloat(val) || 0 };
      } else if (field === "name") {
        return { ...ing, name: val };
      } else {
        return { ...ing, unit: val as any };
      }
    }));
  };

  // Steps
  const addStepRow = () => {
    setSteps([...steps, { keyId: window.crypto.randomUUID(), order: steps.length + 1, description: "", timerMinutes: null }]);
  };

  const removeStepRow = (keyId: string) => {
    const list = steps.filter((step) => step.keyId !== keyId);
    // Recalculate orders
    const updated = list.map((step, i) => ({ ...step, order: i + 1 }));
    setSteps(updated);
  };

  const handleStepChange = (keyId: string, field: keyof Step, val: any) => {
    setSteps(prev => prev.map(step => {
      if (step.keyId !== keyId) return step;
      if (field === "timerMinutes") {
        return { ...step, timerMinutes: val ? parseInt(val) : null };
      } else {
        return { ...step, description: val };
      }
    }));
  };

  // ----------------------------------------------------
  // FORM SUBMISSION
  // ----------------------------------------------------
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    // Validate
    if (!title.trim()) {
      setValidationError("Der Rezepttitel ist ein Pflichtfeld.");
      return;
    }
    const validIngredients = ingredients
      .filter(i => i.name.trim() !== "")
      .map(({ keyId, ...rest }) => rest);
    if (validIngredients.length === 0) {
      setValidationError("Gib mindestens eine Zutat an.");
      return;
    }
    const validSteps = steps
      .filter(s => s.description.trim() !== "")
      .map(({ keyId, ...rest }) => rest);
    if (validSteps.length === 0) {
      setValidationError("Gib mindestens einen Zubereitungsschritt an.");
      return;
    }

    let finalPhotoPath = photoPath;

    try {
      // 1. Upload photo if selected
      if (photoFile) {
        setIsUploadingPhoto(true);
        const formData = new FormData();
        formData.append("photo", photoFile);

        const response = await apiFetch("/api/photos", {
          method: "POST",
          body: formData
        });

        if (response.ok) {
          const resJson = await response.json();
          finalPhotoPath = resJson.photo_path;
        } else {
          console.error("Photo upload failed");
        }
      }

      // 2. Perform Save mutation
      const recipeId = isEditMode && id ? id : window.crypto.randomUUID();
      const nutritionObj: Nutrition = {
        caloriesPerServing: calories,
        proteinG: protein,
        fatG: fat,
        carbsG: carbs
      };

      await saveRecipe({
        id: recipeId,
        title: title.trim(),
        servings,
        cookingTimeMinutes: cookingTime,
        source: source.trim(),
        dietaryTags,
        ingredients: validIngredients,
        steps: validSteps,
        nutrition: nutritionObj,
        photo_path: finalPhotoPath,
        rating
      });

      // Clear draft on successful save
      sessionStorage.removeItem("omninom_recipe_draft");

      navigate(isEditMode ? `/recipe/${id}` : "/recipes");
    } catch (err) {
      console.error(err);
      setValidationError("Fehler beim Speichern des Rezepts. Bitte überprüfe Deine Verbindung.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8 space-y-6">
      
      {/* Title Bar */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <button 
          onClick={() => {
            sessionStorage.removeItem("omninom_recipe_draft");
            navigate(-1);
          }} 
          className="flex items-center gap-2 text-sm font-bold text-on-surface-muted hover:text-on-surface cursor-pointer min-h-[44px]"
        >
          <ArrowLeft size={18} />
          <span>Zurück</span>
        </button>
        <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">
          {isEditMode ? "Rezept bearbeiten" : "Neues Rezept erstellen"}
        </h2>
        <div className="w-16" /> {/* spacer */}
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div className="flex items-center gap-2 rounded-xl bg-error/15 p-3 text-xs text-error font-semibold">
          <span>⚠️ {validationError}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Photo Capture Section */}
        <section className="bg-surface rounded-2xl border border-border p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted flex items-center gap-1.5">
            Rezeptfoto
          </h3>
          <PhotoCapture
            photoPath={photoPath ? `${getServerUrl()}${photoPath}` : null}
            onPhotoSelected={(file) => setPhotoFile(file)}
            onPhotoCleared={() => { setPhotoFile(null); setPhotoPath(null); }}
          />
          <div className="pt-1">
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="w-full h-12 flex items-center justify-center gap-2.5 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary text-sm font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Sparkles size={16} className={isGeneratingImage ? "animate-spin" : ""} />
              <span>{isGeneratingImage ? "Generiere Rezeptbild..." : "Bild mit KI generieren (Flux)"}</span>
            </button>
          </div>
        </section>

        {/* General Details */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Rezeptdetails</h3>
            <button
              type="button"
              onClick={handleEnrichRecipe}
              disabled={isEnriching}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary transition-all disabled:opacity-50 cursor-pointer min-h-[36px]"
            >
              <Sparkles size={14} className={isEnriching ? "animate-spin" : ""} />
              <span>{isEnriching ? "Ergänze..." : "Infos mit KI ergänzen"}</span>
            </button>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-muted uppercase">Rezepttitel *</label>
            <div className="relative">
              <Type className="absolute top-4 left-3.5 h-5 w-5 text-on-surface-muted" />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Omas Linseneintopf"
                className="w-full h-12 rounded-xl border border-border bg-background pr-4 pl-10 text-sm focus:border-primary focus:outline-none font-semibold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase">Portionen</label>
              <div className="flex items-center h-12 border border-border rounded-xl bg-background overflow-hidden">
                <button
                  type="button"
                  onClick={() => setServings(s => Math.max(1, s - 1))}
                  className="w-12 h-full text-lg hover:bg-muted font-bold cursor-pointer flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 2))}
                  className="w-full border-none bg-transparent text-center text-sm font-semibold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setServings(s => s + 1)}
                  className="w-12 h-full text-lg hover:bg-muted font-bold cursor-pointer flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase">Kochzeit (Minuten)</label>
              <input
                type="number"
                value={cookingTime}
                onChange={(e) => setCookingTime(Math.max(1, parseInt(e.target.value) || 30))}
                className="w-full h-12 rounded-xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none font-semibold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-muted uppercase">Quelle (optional)</label>
            <div className="relative">
              <LinkIcon className="absolute top-4 left-3.5 h-5 w-5 text-on-surface-muted" />
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Buchseite oder Webseiten-Link"
                className="w-full h-12 rounded-xl border border-border bg-background pr-4 pl-10 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-muted uppercase">Rezeptbewertung</label>
            <div className="py-1">
              <StarRating rating={rating} onChange={setRating} size={24} interactive={true} />
            </div>
          </div>
        </section>

        {/* Dietary Tags */}
        <section className="bg-surface rounded-2xl border border-border p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Ernährungsweise</h3>
          <DietaryTagPicker selectedTags={dietaryTags} onChange={setDietaryTags} />
        </section>

        {/* Ingredients Section */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Zutaten</h3>
          
          <div className="space-y-3">
            {ingredients.map((ing) => (
              <div key={ing.keyId} className="flex gap-2 items-center">
                <input
                  type="number"
                  step="any"
                  value={ing.amount || ""}
                  onChange={(e) => handleIngredientChange(ing.keyId, "amount", e.target.value)}
                  placeholder="Menge"
                  className="w-20 h-12 rounded-xl border border-border bg-background px-3 text-sm text-center focus:border-primary focus:outline-none font-bold"
                />
                
                <select
                  value={ing.unit}
                  onChange={(e) => handleIngredientChange(ing.keyId, "unit", e.target.value)}
                  className="h-12 rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none font-bold"
                >
                  {SUPPORTED_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => handleIngredientChange(ing.keyId, "name", e.target.value)}
                  placeholder="Zutat (z.B. Mehl)"
                  className="flex-1 h-12 rounded-xl border border-border bg-background px-4 text-sm focus:border-primary focus:outline-none font-bold"
                />

                {ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredientRow(ing.keyId)}
                    className="p-3 rounded-xl text-error hover:bg-error/10 cursor-pointer transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                    title="Löschen"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addIngredientRow}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-hover py-2 min-h-[44px] cursor-pointer transition-colors"
          >
            <Plus size={18} />
            <span>Zutat hinzufügen</span>
          </button>
        </section>

        {/* Cooking Steps Section */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Schritt-für-Schritt Zubereitung</h3>
          
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.keyId} className="flex gap-3.5 items-start border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary text-xs font-bold mt-3">
                  {step.order}
                </div>
                
                <div className="flex-1 space-y-3.5">
                  <textarea
                    value={step.description}
                    onChange={(e) => handleStepChange(step.keyId, "description", e.target.value)}
                    placeholder={`Details zu Schritt ${step.order}`}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background p-3.5 text-sm focus:border-primary focus:outline-none font-medium"
                  />
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface-muted uppercase">Timer (optional):</span>
                    <input
                      type="number"
                      value={step.timerMinutes || ""}
                      onChange={(e) => handleStepChange(step.keyId, "timerMinutes", e.target.value)}
                      placeholder="Minuten"
                      className="w-20 h-10 rounded-xl border border-border bg-background px-3 text-xs focus:border-primary focus:outline-none font-bold text-center"
                    />
                  </div>
                </div>

                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStepRow(step.keyId)}
                    className="p-3 rounded-xl text-error hover:bg-error/10 cursor-pointer mt-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
                    title="Schritt löschen"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addStepRow}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-hover py-2 min-h-[44px] cursor-pointer transition-colors"
          >
            <Plus size={18} />
            <span>Zubereitungsschritt hinzufügen</span>
          </button>
        </section>

        {/* Nutrition values Section */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Nährwertangaben (pro Portion)</h3>
          
          <div className="grid grid-cols-4 gap-2.5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase text-center block">Kcal</label>
              <input
                type="number"
                value={calories || ""}
                onChange={(e) => setCalories(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full h-12 rounded-xl border border-border bg-background text-sm text-center focus:border-primary focus:outline-none font-bold"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase text-center block">Protein (g)</label>
              <input
                type="number"
                step="any"
                value={protein || ""}
                onChange={(e) => setProtein(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full h-12 rounded-xl border border-border bg-background text-sm text-center focus:border-primary focus:outline-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase text-center block">Fett (g)</label>
              <input
                type="number"
                step="any"
                value={fat || ""}
                onChange={(e) => setFat(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full h-12 rounded-xl border border-border bg-background text-sm text-center focus:border-primary focus:outline-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-muted uppercase text-center block">Kohlenhydrate (g)</label>
              <input
                type="number"
                step="any"
                value={carbs || ""}
                onChange={(e) => setCarbs(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full h-12 rounded-xl border border-border bg-background text-sm text-center focus:border-primary focus:outline-none font-bold"
              />
            </div>
          </div>
        </section>

        {/* Action button */}
        <button
          type="submit"
          disabled={isSaving || isUploadingPhoto}
          className="w-full h-14 rounded-xl bg-primary font-extrabold text-sm text-white hover:bg-primary-hover shadow-md active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isSaving || isUploadingPhoto ? (
            <Loader className="h-5 w-5 text-white" />
          ) : (
            <Save size={20} />
          )}
          <span>{isEditMode ? "Änderungen speichern" : "Rezept speichern"}</span>
        </button>

      </form>
    </div>
  );
}
