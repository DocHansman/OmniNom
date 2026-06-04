import React, { createContext, useContext, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { 
  BookOpen, 
  Calendar, 
  ChefHat, 
  Package, 
  ShoppingCart, 
  Sun, 
  Moon, 
  LogOut, 
  Wifi, 
  WifiOff,
  Settings
} from "lucide-react";

import { 
  getServerUrl, 
  getUserId, 
  setAccessToken, 
  SERVER_URL_KEY, 
  USER_ID_KEY, 
  registerOnTokenExpired,
  attemptTokenRefresh,
  fetchIsAdmin,
  fetchAvailableModels
} from "./api/apiClient";
import { deriveKeys } from "./crypto/cryptoEngine";
import { clearAllStores } from "./db/localDb";
import { useSync } from "./hooks/useSync";
import ConflictResolutionModal from "./components/ConflictResolutionModal";
import { useShoppingList } from "./hooks/useShoppingList";
import { useRecipes } from "./hooks/useRecipes";
import { useMealPlan } from "./hooks/useMealPlan";

// Pages
import OnboardingPage from "./pages/OnboardingPage";
import RecipesPage from "./pages/RecipesPage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import RecipeEditor from "./components/RecipeEditor";
import CookingPage from "./pages/CookingPage";
import MealPlanPage from "./pages/MealPlanPage";
import InventoryPage from "./pages/InventoryPage";
import ShoppingPage from "./pages/ShoppingPage";
import SettingsPage from "./pages/SettingsPage";
import Loader from "./components/Loader";

// TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Auth Context Definition
interface AuthContextType {
  isAuthenticated: boolean;
  cryptoKey: CryptoKey | null;
  userId: string | null;
  serverUrl: string;
  isAdmin: boolean;
  hasNewModels: boolean;
  clearNewModelsBadge: () => void;
  login: (serverUrl: string, userId: string, masterKeyHex: string, token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

// SyncManager Component to activate useSync E2EE offline/online sync
function SyncManager() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <SyncManagerInternal />;
}

function SyncManagerInternal() {
  const { conflict, resolveConflict } = useSync();

  return (
    <>
      {conflict && (
        <ConflictResolutionModal
          conflict={conflict}
          onResolve={resolveConflict}
        />
      )}
    </>
  );
}

// ShoppingListRecalculator Component to automatically trigger calculations
function ShoppingListRecalculator() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <ShoppingListRecalculatorInternal />;
}

function ShoppingListRecalculatorInternal() {
  const { recipes } = useRecipes();
  const { mealPlan } = useMealPlan();
  const { calculateShoppingNeeds } = useShoppingList();

  useEffect(() => {
    const handleRecalculate = () => {
      console.log("Automatically recalculating shopping list needs...");
      calculateShoppingNeeds(recipes, mealPlan);
    };

    window.addEventListener("recalculate-shopping-list", handleRecalculate);
    return () => {
      window.removeEventListener("recalculate-shopping-list", handleRecalculate);
    };
  }, [recipes, mealPlan, calculateShoppingNeeds]);

  return null;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  
  // Admin & Model notification state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [hasNewModels, setHasNewModels] = useState<boolean>(false);

  const clearNewModelsBadge = () => {
    setHasNewModels(false);
  };

  const checkForNewModels = async () => {
    try {
      const models = await fetchAvailableModels();
      const stored = localStorage.getItem("omninom_known_models");
      if (stored) {
        const knownIds: string[] = JSON.parse(stored);
        const hasNew = models.some(m => !knownIds.includes(m.id));
        if (hasNew) {
          setHasNewModels(true);
          window.dispatchEvent(new CustomEvent("show-toast", {
            detail: { msg: "Neue KI-Modelle in den Einstellungen verfügbar!", type: "info" }
          }));
        }
      } else {
        const ids = models.map(m => m.id);
        localStorage.setItem("omninom_known_models", JSON.stringify(ids));
      }
    } catch (e) {
      console.error("checkForNewModels failed:", e);
    }
  };
  
  // Theme State
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") || 
          (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );

  // PWA Update State
  const [showUpdatePrompt, setShowUpdatePrompt] = useState<boolean>(false);
  const [updateCallback, setUpdateCallback] = useState<(() => void) | null>(null);

  // Toast System State & Listener
  interface Toast {
    id: string;
    msg: string;
    type: "success" | "error" | "info";
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ msg: string; type?: "success" | "error" | "info" }>;
      const newToast: Toast = {
        id: Math.random().toString(36).substring(2, 9),
        msg: customEvent.detail.msg,
        type: customEvent.detail.type || "info"
      };
      setToasts((prev) => [...prev, newToast]);
      
      // Auto remove after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener("show-toast", handleShowToast);
    return () => window.removeEventListener("show-toast", handleShowToast);
  }, []);

  // Track Network Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Listen for PWA updates
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ update: () => void }>;
      setUpdateCallback(() => customEvent.detail.update);
      setShowUpdatePrompt(true);
    };
    window.addEventListener("pwa-update-available", handleUpdate);
    return () => window.removeEventListener("pwa-update-available", handleUpdate);
  }, []);

  // Initial key restoration from sessionStorage
  useEffect(() => {
    async function restoreSession() {
      const savedServerUrl = getServerUrl();
      const savedUserId = getUserId();
      const savedMasterKey = sessionStorage.getItem("omninom_master_key");

      if (savedServerUrl && savedUserId && savedMasterKey) {
        try {
          const { cryptoKey: derived } = await deriveKeys(savedMasterKey);
          setCryptoKey(derived);
          setUserId(savedUserId);
          setServerUrl(savedServerUrl);

          if (navigator.onLine) {
            const refreshed = await attemptTokenRefresh();
            if (refreshed) {
              setIsAuthenticated(true);
              try {
                const adminResult = await fetchIsAdmin();
                setIsAdmin(adminResult);
                if (adminResult) {
                  checkForNewModels();
                }
              } catch (e) {
                console.error("Failed to check admin status on session restore:", e);
                setIsAdmin(false);
              }
            } else {
              console.warn("Session restoration failed: token refresh failed.");
              logout();
            }
          } else {
            // Offline: allow entry with local E2EE data
            setIsAuthenticated(true);
          }
        } catch (e) {
          console.error("Session restoration failed", e);
          sessionStorage.clear();
        }
      }
      setIsInitializing(false);
    }
    restoreSession();
  }, []);

  // Register token expired callback to force log out
  useEffect(() => {
    registerOnTokenExpired(() => {
      logout();
    });
  }, []);

  // Theme effect
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const login = async (url: string, uid: string, masterKeyHex: string, token: string) => {
    localStorage.setItem(SERVER_URL_KEY, url);
    localStorage.setItem(USER_ID_KEY, uid);
    sessionStorage.setItem("omninom_master_key", masterKeyHex);
    // Note: token is kept in-memory only for security, not saved in sessionStorage
    
    setAccessToken(token);
    const { cryptoKey: derived } = await deriveKeys(masterKeyHex);
    setCryptoKey(derived);
    setUserId(uid);
    setServerUrl(url);
    setIsAuthenticated(true);

    try {
      const adminResult = await fetchIsAdmin();
      setIsAdmin(adminResult);
      if (adminResult) {
        checkForNewModels();
      }
    } catch (e) {
      console.error("Failed to check admin status on login:", e);
      setIsAdmin(false);
    }
  };

  const logout = async () => {
    // Clear storage keys
    localStorage.removeItem(SERVER_URL_KEY);
    localStorage.removeItem(USER_ID_KEY);
    sessionStorage.clear();
    setAccessToken(null);
    setCryptoKey(null);
    setUserId(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setHasNewModels(false);
    
    // Clear local cache IndexedDB
    try {
      await clearAllStores();
      queryClient.clear();
    } catch (e) {
      console.error("Failed to clear local database stores on logout", e);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-on-surface">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium tracking-wide">Sitzung wird wiederhergestellt...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ isAuthenticated, cryptoKey, userId, serverUrl, isAdmin, hasNewModels, clearNewModelsBadge, login, logout }}>
        <SyncManager />
        <ShoppingListRecalculator />
        <BrowserRouter>
          <div className="flex h-screen flex-col md:flex-row bg-background text-on-surface transition-colors duration-200">
            {/* Top Bar on Mobile & Layout Orchestrator */}
            {isAuthenticated && (
              <>
                {/* Desktop Left Sidebar Navigation */}
                <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-surface">
                  <div className="flex h-16 items-center gap-2 px-6 border-b border-border">
                    <span className="text-xl">🍳</span>
                    <span className="font-bold text-lg tracking-tight text-primary">OmniNom</span>
                    <span className="ml-auto flex h-2 w-2 rounded-full" style={{ backgroundColor: isOnline ? 'var(--color-success)' : 'var(--color-error)' }} />
                  </div>
                  
                  <nav className="flex-1 space-y-1 px-4 py-6">
                    <SidebarLink to="/recipes" icon={<BookOpen size={20} />} label="Rezepte" />
                    <SidebarLink to="/meal-plan" icon={<Calendar size={20} />} label="Wochenplan" />
                    <SidebarLink to="/cooking" icon={<ChefHat size={20} />} label="Kochen" />
                    <SidebarLink to="/inventory" icon={<Package size={20} />} label="Vorratskammer" />
                    <SidebarLink to="/shopping-list" icon={<ShoppingCart size={20} />} label="Einkaufsliste" />
                    {isAdmin && (
                      <div className="relative">
                        <SidebarLink to="/settings" icon={<Settings size={20} />} label="Einstellungen" />
                        {hasNewModels && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </div>
                    )}
                  </nav>

                  <div className="border-t border-border p-4 space-y-2">
                    <button 
                      onClick={toggleTheme} 
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-all cursor-pointer"
                    >
                      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                      <span>{theme === "light" ? "Dunkelmodus" : "Lichtmodus"}</span>
                    </button>
                    <button 
                      onClick={logout} 
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-error hover:bg-muted transition-all cursor-pointer"
                    >
                      <LogOut size={18} />
                      <span>Abmelden</span>
                    </button>
                  </div>
                </aside>

                {/* Mobile Header Banner */}
                <header className="flex h-14 items-center justify-between px-4 border-b border-border bg-surface md:hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🍳</span>
                    <span className="font-bold text-primary">OmniNom</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Connection status badge */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted">
                      {isOnline ? (
                        <>
                          <Wifi size={12} className="text-success" />
                          <span className="text-[10px] text-on-surface-muted">Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff size={12} className="text-error" />
                          <span className="text-[10px] text-error font-medium">Offline</span>
                        </>
                      )}
                    </div>
                    <button onClick={toggleTheme} className="p-1 rounded-md hover:bg-muted cursor-pointer">
                      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                    {isAdmin && (
                      <Link to="/settings" className="relative p-1 rounded-md hover:bg-muted cursor-pointer text-on-surface flex items-center justify-center">
                        <Settings size={18} />
                        {hasNewModels && (
                          <span className="absolute top-0 right-0 flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        )}
                      </Link>
                    )}
                    <button onClick={logout} className="p-1 rounded-md text-error hover:bg-muted cursor-pointer">
                      <LogOut size={18} />
                    </button>
                  </div>
                </header>
              </>
            )}

            {/* Main Application Routes Container */}
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
              <Routes>
                {/* Public Onboarding routes */}
                <Route path="/onboarding" element={!isAuthenticated ? <OnboardingPage /> : <Navigate to="/recipes" />} />
                <Route path="/invite/:token" element={!isAuthenticated ? <OnboardingPage /> : <Navigate to="/recipes" />} />

                {/* Private Authenticated App routes */}
                <Route path="/recipes" element={isAuthenticated ? <RecipesPage /> : <Navigate to="/onboarding" />} />
                <Route path="/recipe/new" element={isAuthenticated ? <RecipeEditor /> : <Navigate to="/onboarding" />} />
                <Route path="/recipe/:id" element={isAuthenticated ? <RecipeDetailPage /> : <Navigate to="/onboarding" />} />
                <Route path="/recipe/:id/edit" element={isAuthenticated ? <RecipeEditor /> : <Navigate to="/onboarding" />} />
                <Route path="/cooking" element={isAuthenticated ? <CookingPage /> : <Navigate to="/onboarding" />} />
                <Route path="/cooking/:id" element={isAuthenticated ? <CookingPage /> : <Navigate to="/onboarding" />} />
                <Route path="/meal-plan" element={isAuthenticated ? <MealPlanPage /> : <Navigate to="/onboarding" />} />
                <Route path="/inventory" element={isAuthenticated ? <InventoryPage /> : <Navigate to="/onboarding" />} />
                <Route path="/shopping-list" element={isAuthenticated ? <ShoppingPage /> : <Navigate to="/onboarding" />} />
                <Route path="/settings" element={isAuthenticated ? <SettingsPage /> : <Navigate to="/onboarding" />} />
                
                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to={isAuthenticated ? "/recipes" : "/onboarding"} />} />
              </Routes>
            </main>

            {/* Mobile Bottom Tab Navigation */}
            {isAuthenticated && (
              <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-surface flex items-center justify-around px-2 md:hidden z-10">
                <BottomNavLink to="/recipes" icon={<BookOpen size={22} />} label="Rezepte" />
                <BottomNavLink to="/meal-plan" icon={<Calendar size={22} />} label="Planer" />
                <BottomNavLink to="/cooking" icon={<ChefHat size={22} />} label="Kochen" />
                <BottomNavLink to="/inventory" icon={<Package size={22} />} label="Vorrat" />
                <BottomNavLink to="/shopping-list" icon={<ShoppingCart size={22} />} label="Einkauf" />
              </nav>
            )}
          </div>

          {/* PWA Service Worker Update Prompt Snackbar */}
          {showUpdatePrompt && (
            <div className="fixed bottom-20 left-4 right-4 md:bottom-6 md:right-6 md:left-auto max-w-sm rounded-lg border border-primary bg-surface p-4 shadow-xl z-50 animate-slide-up flex flex-col gap-3">
              <div>
                <p className="font-semibold text-sm">Update Verfügbar</p>
                <p className="text-xs text-on-surface-muted">Eine neuere App-Version wurde heruntergeladen. Jetzt neu laden, um die Änderungen zu aktivieren.</p>
              </div>
              <div className="flex justify-end gap-2 text-xs">
                <button 
                  onClick={() => setShowUpdatePrompt(false)} 
                  className="px-3 py-1.5 rounded hover:bg-muted text-on-surface-muted font-medium cursor-pointer"
                >
                  Später
                </button>
                <button 
                  onClick={() => {
                    if (updateCallback) updateCallback();
                    setShowUpdatePrompt(false);
                  }} 
                  className="px-3 py-1.5 rounded bg-primary text-white hover:bg-primary-hover font-semibold cursor-pointer"
                >
                  Neu laden
                </button>
              </div>
            </div>
          )}
          {/* Toasts Container */}
          <div className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-xl p-3.5 shadow-lg border transition-all duration-300 flex items-center justify-between text-xs font-semibold animate-slide-up ${
                  toast.type === "success"
                    ? "bg-success/15 border-success/30 text-success"
                    : toast.type === "error"
                    ? "bg-error/15 border-error/30 text-error"
                    : "bg-surface border-border text-on-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "⚠️" : "ℹ️"}</span>
                  <span>{toast.msg}</span>
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="ml-4 text-on-surface-muted hover:text-on-surface cursor-pointer text-base font-bold leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

// Sidebar Link Component (Desktop)
function SidebarLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
        isActive 
          ? "bg-primary-light text-primary" 
          : "hover:bg-muted text-on-surface-muted hover:text-on-surface"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

// Bottom Tab Navigation Link Component (Mobile)
function BottomNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Link 
      to={to} 
      className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold cursor-pointer transition-all ${
        isActive 
          ? "text-primary" 
          : "text-on-surface-muted"
      }`}
    >
      <div className={`p-1 rounded-full ${isActive ? 'bg-primary-light/50' : ''}`}>
        {icon}
      </div>
      <span>{label}</span>
    </Link>
  );
}
