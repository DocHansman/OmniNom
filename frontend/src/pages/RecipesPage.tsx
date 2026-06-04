import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, 
  Plus, 
  Globe, 
  Camera, 
  ChevronDown, 
  X, 
  Sparkles,
  Link as LinkIcon,
  Filter,
  Clock,
  Star,
  ArrowUpDown
} from "lucide-react";

import { useRecipes } from "../hooks/useRecipes";
import RecipeCard from "../components/RecipeCard";
import AiScanOverlay from "../components/AiScanOverlay";
import PhotoCapture from "../components/PhotoCapture";
import { apiFetch } from "../api/apiClient";
import InstallPrompt from "../components/InstallPrompt";
import RecipeSuggester from "../components/RecipeSuggester";
import Loader from "../components/Loader";

export default function RecipesPage() {
  const navigate = useNavigate();
  const { recipes, isLoading } = useRecipes();
  const [isSuggesterOpen, setIsSuggesterOpen] = useState<boolean>(false);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [maxTime, setMaxTime] = useState<number | "all">("all");
  const [minRating, setMinRating] = useState<number | "all">("all");
  const [sortBy, setSortBy] = useState<"title" | "rating" | "time">("title");

  // Speed Dial FAB State
  const [isFabOpen, setIsFabOpen] = useState<boolean>(false);

  // Scraper Modal State
  const [isScraperOpen, setIsScraperOpen] = useState<boolean>(false);
  const [scrapeUrl, setScrapeUrl] = useState<string>("");
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scraperError, setScraperError] = useState<string>("");

  // Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);


  const activeAbortController = React.useRef<AbortController | null>(null);

  // ----------------------------------------------------
  // FILTER & SEARCH LOGIC
  // ----------------------------------------------------
  
  const filteredRecipes = recipes.filter((recipe) => {
    // 1. Search Query (Title + Ingredients)
    const matchesSearch = 
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.ingredients.some(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // 2. Dietary Tag
    const matchesTag = !selectedTag || recipe.dietaryTags.includes(selectedTag);

    // 3. Max cooking time
    const matchesTime = maxTime === "all" || recipe.cookingTimeMinutes <= maxTime;

    // 4. Min rating
    const matchesRating = minRating === "all" || (recipe.rating !== null && recipe.rating >= minRating);

    return matchesSearch && matchesTag && matchesTime && matchesRating;
  });

  // Sort Recipes
  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "time") return a.cookingTimeMinutes - b.cookingTimeMinutes;
    return 0;
  });

  // Unique tags across all recipes for filter dropdown
  const allTags = Array.from(new Set(recipes.flatMap((r) => r.dietaryTags)));

  // ----------------------------------------------------
  // SCAPE & SCAN ACTIONS
  // ----------------------------------------------------
  
  const cancelActiveRequest = () => {
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    setIsScraping(false);
    setIsScanning(false);
  };

  const handleScrapeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScraperError("");

    if (!scrapeUrl.trim() || !scrapeUrl.startsWith("http")) {
      setScraperError("Bitte eine gültige HTTP/HTTPS URL eingeben.");
      return;
    }

    setIsScraping(true);
    const controller = new AbortController();
    activeAbortController.current = controller;

    try {
      const response = await apiFetch("/api/scrape", {
        method: "POST",
        body: JSON.stringify({ url: scrapeUrl.trim() }),
        signal: controller.signal
      });

      if (response.ok) {
        const recipeData = await response.json();
        setIsScraperOpen(false);
        setScrapeUrl("");
        
        // Navigate to editor with pre-filled state!
        navigate("/recipe/new", { state: { prefilledData: recipeData } });
      } else {
        const errText = await response.text();
        setScraperError(errText || "Fehler beim Auslesen der Rezept-Metadaten.");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setScraperError("Netzwerkfehler beim Scraping.");
      }
    } finally {
      setIsScraping(false);
    }
  };

  const handleScanSubmit = async () => {
    if (!scanFile) {
      const toastEvent = new CustomEvent("show-toast", {
        detail: { msg: "Bitte wähle zuerst ein Foto aus.", type: "error" }
      });
      window.dispatchEvent(toastEvent);
      return;
    }

    setIsScanning(true);
    setIsScannerOpen(false); // Close the modal immediately to avoid duplicate loading indicators!
    
    const controller = new AbortController();
    activeAbortController.current = controller;

    const formData = new FormData();
    formData.append("image", scanFile);

    try {
      const response = await apiFetch("/api/recipe/from-photo", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (response.ok) {
        const recipeData = await response.json();
        setScanFile(null);
        
        // Navigate to editor with pre-filled state!
        navigate("/recipe/new", { state: { prefilledData: recipeData } });
      } else {
        const errText = await response.text();
        const toastEvent = new CustomEvent("show-toast", {
          detail: { msg: errText || "Rezept konnte nicht erkannt werden. Bitte Foto erneut aufnehmen.", type: "error" }
        });
        window.dispatchEvent(toastEvent);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const toastEvent = new CustomEvent("show-toast", {
          detail: { msg: "Netzwerkfehler bei AI Foto-Anfrage.", type: "error" }
        });
        window.dispatchEvent(toastEvent);
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="relative min-h-full px-4 py-6 md:px-8 md:py-8 space-y-6">
      
      {/* Search Header banner */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-on-surface flex items-center gap-2">
          <span>Rezeptbuch</span>
          <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-bold text-primary">
            {recipes.length}
          </span>
        </h2>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute top-3 left-3.5 h-4 w-4 text-on-surface-muted" />
          <input
            type="text"
            placeholder="Rezepte oder Zutaten suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface py-2.5 pr-4 pl-10 text-sm focus:border-primary focus:outline-none shadow-xs transition-colors"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")} 
              className="absolute top-2.5 right-3 p-0.5 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0 text-xs font-bold whitespace-nowrap">
        {/* KI recipe suggest button */}
        <button
          onClick={() => setIsSuggesterOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-light border border-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer h-10 select-none shrink-0"
        >
          <Sparkles size={13} />
          <span>Vorschläge (KI)</span>
        </button>

        {/* Tag selection dropdown */}
        <div className="relative flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-on-surface hover:bg-muted/30 shadow-xs transition-colors h-10 select-none shrink-0">
          <div className="flex items-center gap-1.5 pointer-events-none">
            <Filter size={13} className="text-on-surface-muted" />
            <span>{selectedTag ? `Diät: ${selectedTag}` : "Ernährungsweise"}</span>
            <ChevronDown size={12} className="text-on-surface-muted" />
          </div>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="">Alle Ernährungsweisen</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        {/* Time Limit dropdown */}
        <div className="relative flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-on-surface hover:bg-muted/30 shadow-xs transition-colors h-10 select-none shrink-0">
          <div className="flex items-center gap-1.5 pointer-events-none">
            <Clock size={13} className="text-on-surface-muted" />
            <span>{maxTime === "all" ? "Kochzeit" : `< ${maxTime} Min.`}</span>
            <ChevronDown size={12} className="text-on-surface-muted" />
          </div>
          <select
            value={maxTime}
            onChange={(e) => setMaxTime(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="all">Beliebige Kochzeit</option>
            <option value="15">&lt; 15 min</option>
            <option value="30">&lt; 30 min</option>
            <option value="45">&lt; 45 min</option>
            <option value="60">&lt; 60 min</option>
          </select>
        </div>

        {/* Rating filter dropdown */}
        <div className="relative flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-on-surface hover:bg-muted/30 shadow-xs transition-colors h-10 select-none shrink-0">
          <div className="flex items-center gap-1.5 pointer-events-none">
            <Star size={13} className="text-on-surface-muted" />
            <span>{minRating === "all" ? "Bewertung" : `${minRating}★ +`}</span>
            <ChevronDown size={12} className="text-on-surface-muted" />
          </div>
          <select
            value={minRating}
            onChange={(e) => setMinRating(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="all">Alle Sterne-Bewertungen</option>
            <option value="5">★★★★★ (5)</option>
            <option value="4">★★★★☆ (4+)</option>
            <option value="3">★★★☆☆ (3+)</option>
          </select>
        </div>

        {/* Sorting Dropdown */}
        <div className="relative flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-on-surface hover:bg-muted/30 shadow-xs transition-colors h-10 select-none shrink-0 md:ml-auto">
          <div className="flex items-center gap-1.5 pointer-events-none">
            <ArrowUpDown size={13} className="text-on-surface-muted" />
            <span>
              {sortBy === "title" ? "Name" : sortBy === "rating" ? "Sterne" : "Kochzeit"}
            </span>
            <ChevronDown size={12} className="text-on-surface-muted" />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <option value="title">Sortieren nach: Name</option>
            <option value="rating">Sortieren nach: Sterne</option>
            <option value="time">Sortieren nach: Kochzeit</option>
          </select>
        </div>
      </div>

      {/* Recipes Loading & Grid container */}
      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader className="h-8 w-8 text-primary" />
        </div>
      ) : sortedRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-2xl bg-surface/50 h-60 gap-3">
          <span className="text-3xl">🍽️</span>
          <div>
            <p className="font-bold text-sm">Keine Rezepte gefunden</p>
            <p className="text-xs text-on-surface-muted mt-0.5">
              {recipes.length === 0 
                ? "Füge dein erstes Rezept manuell, per URL oder Foto-Scan hinzu!"
                : "Passe die Filter an, um andere Rezepte anzuzeigen."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {sortedRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {/* Floating Action Button (FAB) Speed Dial */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-8 z-30 flex flex-col items-end gap-2.5">
        {/* Speed Dial Menu Items */}
        {isFabOpen && (
          <div className="flex flex-col items-end gap-2.5 animate-scale-in mb-1">
            {/* Scrape URL Button */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-black/75 px-2 py-1 text-[10px] font-bold text-white shadow-md">
                Link importieren
              </span>
              <button 
                onClick={() => { setIsScraperOpen(true); setIsFabOpen(false); }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-white shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Globe size={18} />
              </button>
            </div>

            {/* AI Scan Photo Button */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-black/75 px-2 py-1 text-[10px] font-bold text-white shadow-md">
                Foto scannen (AI)
              </span>
              <button 
                onClick={() => { setIsScannerOpen(true); setIsFabOpen(false); }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-white shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Camera size={18} />
              </button>
            </div>

            {/* Create Manually Button */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-black/75 px-2 py-1 text-[10px] font-bold text-white shadow-md">
                Manuell erstellen
              </span>
              <button 
                onClick={() => navigate("/recipe/new")}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-white shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Master FAB Trigger */}
        <button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer z-40 ${
            isFabOpen ? "rotate-45 bg-error" : ""
          }`}
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      </div>

      {/* --- MODAL: RECIPE SCRAPER (URL IMPORT) --- */}
      {isScraperOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-scale-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col gap-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                <Globe size={18} className="text-primary" /> Rezept per Link importieren
              </h3>
              <button 
                onClick={() => setIsScraperOpen(false)} 
                className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {scraperError && (
              <div className="rounded-lg bg-error/10 p-3 text-xs text-error font-semibold">
                {scraperError}
              </div>
            )}

            <form onSubmit={handleScrapeSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs text-on-surface-muted">
                  Gib einen Rezeptlink von Kochseiten (Chefkoch, Kochbar, etc.) ein. 
                  Wir lesen die strukturierten Schema-Daten aus.
                </p>
                <div className="relative">
                  <LinkIcon className="absolute top-3 left-3 h-4 w-4 text-on-surface-muted" />
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    placeholder="https://www.chefkoch.de/rezepte/..."
                    className="w-full rounded-xl border border-border bg-background py-2.5 pr-3 pl-9 text-sm focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsScraperOpen(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold hover:bg-muted cursor-pointer text-center"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isScraping}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isScraping && <Loader className="h-3.5 w-3.5 text-white" />}
                  <span>Auslesen</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: RECIPE CAMERA SCAN (AI SCAN) --- */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-scale-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl text-on-surface flex flex-col gap-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                <Sparkles size={18} className="text-primary" /> AI Rezept-Foto scannen
              </h3>
              <button 
                onClick={() => setIsScannerOpen(false)} 
                className="p-1 rounded-full hover:bg-muted text-on-surface-muted cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>


            <div className="space-y-4">
              <p className="text-xs text-on-surface-muted">
                Fotografiere ein Kochbuch oder eine Rezeptkarte. Unsere AI 
                extrahiert Zutaten, Portionen, Zeiten und Nährwerte.
              </p>
              
              <PhotoCapture
                photoPath={null}
                onPhotoSelected={(file) => setScanFile(file)}
                onPhotoCleared={() => setScanFile(null)}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold hover:bg-muted cursor-pointer text-center"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleScanSubmit}
                  disabled={isScanning || !scanFile}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white hover:bg-primary-hover shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isScanning && <Loader className="h-3.5 w-3.5 text-white" />}
                  <span>Scan starten</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background Fetch Spinners */}
      {isScraping && <AiScanOverlay onCancel={cancelActiveRequest} />}
      {isScanning && <AiScanOverlay onCancel={cancelActiveRequest} />}

      {/* PWA Installer Prompt */}
      <InstallPrompt />

      {/* Recipe Suggester Modal */}
      <RecipeSuggester isOpen={isSuggesterOpen} onClose={() => setIsSuggesterOpen(false)} />
    </div>
  );
}
