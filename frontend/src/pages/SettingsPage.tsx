import React, { useState, useEffect } from "react";
import { useAuth } from "../App";
import { 
  loadAiSettings, 
  saveAiSettings, 
  fetchAvailableModels, 
  testAiSettings,
  AiModelInfo, 
  AiSettingsConfig 
} from "../api/apiClient";
import Loader from "../components/Loader";
import { Eye, EyeOff, Sparkles, AlertCircle, Save, Activity, CheckCircle, XCircle } from "lucide-react";

const BASELINE_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4-6",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "black-forest-labs/flux.2-flex",
  "black-forest-labs/flux-schnell"
];

// Typical token counts for actions to estimate cost
const TOKENS_PHOTO_SCAN = { input: 1500, output: 800 };
const TOKENS_INVENTORY_SCAN = { input: 1500, output: 800 };
const TOKENS_ENRICH = { input: 1000, output: 500 };
const TOKENS_SUGGEST = { input: 2500, output: 1200 };

export default function SettingsPage() {
  const { clearNewModelsBadge } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [modelsList, setModelsList] = useState<AiModelInfo[]>([]);
  const [testResult, setTestResult] = useState<{ status: "success" | "error" | null; message: string }>({ status: null, message: "" });
  
  const [config, setConfig] = useState<AiSettingsConfig>({
    provider: "openrouter",
    apiKey: "",
    models: {
      photoScan: "google/gemini-2.5-flash",
      inventoryScan: "google/gemini-2.5-flash",
      enrich: "google/gemini-2.5-flash",
      suggest: "google/gemini-2.5-flash",
      imageGen: "black-forest-labs/flux.2-flex"
    }
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult({ status: null, message: "" });
    try {
      const result = await testAiSettings(config);
      setTestResult(result);
      if (result.status === "success") {
        window.dispatchEvent(new CustomEvent("show-toast", {
          detail: { msg: "KI-Verbindung erfolgreich getestet!", type: "success" }
        }));
      } else {
        window.dispatchEvent(new CustomEvent("show-toast", {
          detail: { msg: "KI-Verbindungstest fehlgeschlagen.", type: "error" }
        }));
      }
    } catch (e: any) {
      setTestResult({ status: "error", message: e.message || "Unbekannter Fehler beim Testen der Verbindung." });
      window.dispatchEvent(new CustomEvent("show-toast", {
        detail: { msg: "Fehler beim Ausführen des Tests.", type: "error" }
      }));
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    // Clear the notification badge as soon as the settings page is visited
    clearNewModelsBadge();

    async function loadData() {
      try {
        const [fetchedModels, fetchedSettings] = await Promise.all([
          fetchAvailableModels(),
          loadAiSettings()
        ]);
        
        setModelsList(fetchedModels);
        setConfig(fetchedSettings);
        
        // Mark all current models as read in localStorage
        const ids = fetchedModels.map(m => m.id);
        localStorage.setItem("omninom_known_models", JSON.stringify(ids));
      } catch (e) {
        console.error("Failed to load settings data:", e);
        window.dispatchEvent(new CustomEvent("show-toast", {
          detail: { msg: "Fehler beim Laden der Einstellungen.", type: "error" }
        }));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleProviderChange = (provider: "openrouter" | "anthropic" | "gemini" | "openai") => {
    // Pre-populate some defaults when provider switches to make it easy
    const defaultModelForProvider = {
      openrouter: "google/gemini-2.5-flash",
      anthropic: "anthropic/claude-sonnet-4-6",
      gemini: "google/gemini-2.5-flash",
      openai: "openai/gpt-4o-mini"
    }[provider];

    setConfig(prev => ({
      ...prev,
      provider,
      models: {
        ...prev.models,
        photoScan: defaultModelForProvider,
        inventoryScan: defaultModelForProvider,
        enrich: defaultModelForProvider,
        suggest: defaultModelForProvider
      }
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveAiSettings(config);
      window.dispatchEvent(new CustomEvent("show-toast", {
        detail: { msg: "KI-Einstellungen erfolgreich gespeichert!", type: "success" }
      }));
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent("show-toast", {
        detail: { msg: e.message || "Fehler beim Speichern der Einstellungen.", type: "error" }
      }));
    } finally {
      setSaving(false);
    }
  };

  // Helper to format cost in Euro-cents
  const calculateCostString = (modelId: string, tokens: { input: number; output: number }) => {
    const model = modelsList.find(m => m.id === modelId);
    if (!model) return "Kosten unbekannt";
    
    // cost per million tokens
    const inputCost1M = model.inputCostPerMillion;
    const outputCost1M = model.outputCostPerMillion;
    
    // cost for this specific action
    const totalCostUSD = ((tokens.input * inputCost1M) + (tokens.output * outputCost1M)) / 1000000;
    
    // convert to Euro-Cents (assume roughly 1 USD = 0.92 EUR)
    const costInCents = totalCostUSD * 100 * 0.92;
    
    if (costInCents === 0) {
      return "Kostenlos (Free)";
    }
    
    if (costInCents < 0.01) {
      return `Sehr günstig (ca. < 0,01 Cent pro Ausführung)`;
    }
    
    return `ca. ${costInCents.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} Cent pro Ausführung`;
  };

  // Filter models based on selected provider and capabilities
  const getFilteredModels = (supportsVisionOnly: boolean, currentSelectedId: string) => {
    const list = modelsList.filter(m => {
      // Always show the currently selected model so it doesn't disappear from the dropdown
      if (m.id === currentSelectedId) return true;

      // Filter by provider matching the selection if not OpenRouter
      if (config.provider !== "openrouter" && m.provider !== config.provider) {
        return false;
      }

      // If vision is required, model must support vision
      if (supportsVisionOnly && !m.supportsVision) {
        return false;
      }

      const idLower = m.id.toLowerCase();
      const nameLower = m.name.toLowerCase();

      // Exclude base, code, moderation, embedding, and non-cooking fine-tunes to keep quality high
      const unsuitableKeywords = [
        "-base", "/base", "-coder", "code-", "/code", "embedding", "moderation",
        "roleplay", "nsfw", "noromaid", "mythomax", "psyfighter", "fimbulvetr", 
        "bagel", "undi95", "platypus", "toppy", "weaver"
      ];
      if (unsuitableKeywords.some(keyword => idLower.includes(keyword) || nameLower.includes(keyword))) {
        return false;
      }

      // Only include reputable model families for the cooking application
      const suitableFamilies = [
        "google/", "anthropic/", "openai/", "meta-llama/llama-3", 
        "mistralai/", "cohere/command", "microsoft/phi", "qwen/qwen",
        "nvidia/nemotron"
      ];

      // If provider is OpenRouter, restrict to suitable families to declutter
      if (config.provider === "openrouter") {
        if (!suitableFamilies.some(family => idLower.startsWith(family))) {
          return false;
        }
      }

      return true;
    });

    // Sort alphabetically by name (using de-DE locale for proper German Umlaut sorting)
    return list.sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 text-primary" />
          <p className="text-xs text-on-surface-muted">Lade KI-Konfiguration...</p>
        </div>
      </div>
    );
  }

  const providers = [
    { id: "openrouter", name: "OpenRouter", desc: "Empfohlen – Alle Funktionen & flexibelste Modellwahl" },
    { id: "gemini", name: "Google Gemini", desc: "Direkte Anbindung an Google Cloud" },
    { id: "anthropic", name: "Anthropic", desc: "Direkte Anbindung für Claude-Modelle" },
    { id: "openai", name: "OpenAI", desc: "Direkte Anbindung an ChatGPT-Modelle" }
  ] as const;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8 space-y-6">
      
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-extrabold tracking-tight text-on-surface">KI-Einstellungen</h2>
        <p className="text-xs text-on-surface-muted">Konfiguriere Anbieter und Sprachmodelle für Rezept-Scans und Vorschläge.</p>
      </div>

      {/* Global settings banner */}
      <div className="flex gap-3 rounded-2xl bg-primary-light/50 border border-primary/20 p-4 text-xs font-semibold text-primary">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold">Systemweite Einstellungen:</span> Diese Optionen gelten global für alle Benutzer dieser App-Instanz auf dem Server.
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Step 1: Provider selection */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
          <h3 className="text-sm font-extrabold text-on-surface">1. KI-Anbieter auswählen</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {providers.map(p => {
              const isSelected = config.provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected 
                      ? "border-primary bg-primary-light/10 ring-1 ring-primary" 
                      : "border-border hover:bg-muted bg-surface"
                  }`}
                >
                  <span className="text-xs font-extrabold text-on-surface flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${isSelected ? "bg-primary" : "bg-border"}`} />
                    {p.name}
                  </span>
                  <span className="text-[10px] text-on-surface-muted mt-1 leading-normal">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: API Key entry */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
          <h3 className="text-sm font-extrabold text-on-surface">2. API-Zugangsschlüssel</h3>
          
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={config.apiKey}
                onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={
                  config.provider === "openrouter" ? "sk-or-v1-..." :
                  config.provider === "gemini" ? "AIzaSy..." :
                  config.provider === "anthropic" ? "sk-ant-..." : "sk-..."
                }
                className="w-full bg-surface border border-border rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface cursor-pointer p-1 rounded-md"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-on-surface-muted font-medium">
              API-Keys werden auf dem Server AES-GCM verschlüsselt gespeichert und verlassen den Server nie.
            </p>
          </div>
        </div>

        {/* Step 3: Model dropdowns */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Sparkles size={16} className="text-primary" />
            <h3 className="text-sm font-extrabold text-on-surface">3. Modellauswahl & Kosten-Schätzungen</h3>
          </div>

          {/* Model selection slots */}
          <div className="space-y-4">
            
            {/* Photo Scan */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">Foto → Rezept scannen (Vision)</label>
              <select
                value={config.models.photoScan}
                onChange={e => setConfig(prev => ({ ...prev, models: { ...prev.models, photoScan: e.target.value } }))}
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {getFilteredModels(true, config.models.photoScan).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!BASELINE_MODELS.includes(m.id) ? "[NEU]" : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-primary block mt-1">
                {calculateCostString(config.models.photoScan, TOKENS_PHOTO_SCAN)}
              </span>
            </div>

            {/* Inventory Scan */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">Vorrat / Einkaufsbon scannen (Vision)</label>
              <select
                value={config.models.inventoryScan}
                onChange={e => setConfig(prev => ({ ...prev, models: { ...prev.models, inventoryScan: e.target.value } }))}
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {getFilteredModels(true, config.models.inventoryScan).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!BASELINE_MODELS.includes(m.id) ? "[NEU]" : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-primary block mt-1">
                {calculateCostString(config.models.inventoryScan, TOKENS_INVENTORY_SCAN)}
              </span>
            </div>

            {/* Enrich */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">Rezepte mit KI anreichern (Text)</label>
              <select
                value={config.models.enrich}
                onChange={e => setConfig(prev => ({ ...prev, models: { ...prev.models, enrich: e.target.value } }))}
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {getFilteredModels(false, config.models.enrich).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!BASELINE_MODELS.includes(m.id) ? "[NEU]" : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-primary block mt-1">
                {calculateCostString(config.models.enrich, TOKENS_ENRICH)}
              </span>
            </div>

            {/* Suggest */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">Rezeptvorschläge generieren (Text)</label>
              <select
                value={config.models.suggest}
                onChange={e => setConfig(prev => ({ ...prev, models: { ...prev.models, suggest: e.target.value } }))}
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {getFilteredModels(false, config.models.suggest).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!BASELINE_MODELS.includes(m.id) ? "[NEU]" : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-primary block mt-1">
                {calculateCostString(config.models.suggest, TOKENS_SUGGEST)}
              </span>
            </div>

            {/* Image Gen (Hardcoded to OpenRouter Flux) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-muted uppercase tracking-wide">Gericht-Illustration generieren (Bilderzeugung)</label>
              <select
                disabled
                value={config.models.imageGen}
                className="w-full bg-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-on-surface-muted cursor-not-allowed opacity-75"
              >
                <option value="black-forest-labs/flux.2-flex">Flux 2 Flex (via OpenRouter)</option>
              </select>
              <p className="text-[10px] text-on-surface-muted mt-1 leading-normal font-medium">
                Bildgenerierung nutzt immer OpenRouter (Flux-Modell). Falls der globale API-Key kein OpenRouter-Schlüssel ist, wird auf den standardmäßigen OpenRouter-Key des Servers zurückgegriffen.
              </p>
            </div>

          </div>
        </div>

        {/* Connection Test Result Banner */}
        {testResult.status && (
          <div className={`p-4 rounded-xl border flex gap-3 text-xs ${
            testResult.status === "success" 
              ? "bg-success/15 border-success/30 text-success" 
              : "bg-error/15 border-error/30 text-error"
          }`}>
            <span className="shrink-0 mt-0.5 animate-pulse">
              {testResult.status === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
            </span>
            <div>
              <span className="font-extrabold block mb-1">
                {testResult.status === "success" ? "Verbindungstest erfolgreich!" : "Verbindungstest fehlgeschlagen!"}
              </span>
              <p className="leading-normal whitespace-pre-wrap font-medium">{testResult.message}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end items-center gap-3 pt-2">
          <button
            type="button"
            disabled={testing || saving}
            onClick={handleTestConnection}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-xs font-extrabold text-on-surface hover:bg-muted shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {testing ? (
              <Loader className="h-4 w-4 text-on-surface" />
            ) : (
              <Activity size={16} className="text-primary" />
            )}
            <span>Verbindung testen</span>
          </button>

          <button
            type="submit"
            disabled={saving || testing}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-extrabold text-white hover:bg-primary-hover shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <Loader className="h-4 w-4 text-white" />
            ) : (
              <Save size={16} />
            )}
            <span>Einstellungen speichern</span>
          </button>
        </div>

      </form>
    </div>
  );
}
