// Connection configuration keys
export const SERVER_URL_KEY = "omninom_server_url";
export const USER_ID_KEY = "omninom_user_id";
export const MASTER_KEY_KEY = "omninom_master_key"; // Kept in sessionStorage for security

let accessTokenInMemory: string | null = null;
let onTokenExpiredCallback: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessTokenInMemory = token;
}

export function getAccessToken(): string | null {
  return accessTokenInMemory;
}

export function registerOnTokenExpired(callback: () => void) {
  onTokenExpiredCallback = callback;
}

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) || window.location.origin;
}

export function getUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

/**
 * Perform an authenticated API call.
 * Handles automatic JWT token refresh if 401 is encountered.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const serverUrl = getServerUrl();
  const url = `${serverUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  // Clone options and ensure headers object
  const fetchOptions = { ...options };
  const headers = new Headers(fetchOptions.headers || {});

  // Append Bearer token if we have one in memory
  if (accessTokenInMemory) {
    headers.set("Authorization", `Bearer ${accessTokenInMemory}`);
  }
  
  // Default JSON Content-Type if body is present and not multipart
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  fetchOptions.headers = headers;
  fetchOptions.credentials = "include"; // Essential to send HTTP-only JWT cookies (refresh_token)

  try {
    let response = await fetch(url, fetchOptions);

    // If 401 Unauthorized, try refreshing the access token
    if (response.status === 401) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Retry the original request with the new token
        headers.set("Authorization", `Bearer ${accessTokenInMemory}`);
        fetchOptions.headers = headers;
        response = await fetch(url, fetchOptions);
      } else {
        // Token refresh failed, trigger logout/re-onboard
        if (onTokenExpiredCallback) {
          onTokenExpiredCallback();
        }
      }
    }

    return response;
  } catch (error) {
    // Check if it's a network/connectivity error
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      throw new Error("NETWORK_OFFLINE");
    }
    throw error;
  }
}

/**
 * Call the POST /auth/refresh endpoint to exchange HTTP-only refresh cookie for a new access token.
 */
export async function attemptTokenRefresh(): Promise<boolean> {
  const serverUrl = getServerUrl();
  try {
    const response = await fetch(`${serverUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Token refresh API network failure", e);
    return false;
  }
}

export async function googleLogin(idToken: string): Promise<{
  access_token: string;
  master_key_hex: string;
  user_id: string;
}> {
  const serverUrl = getServerUrl();
  const response = await fetch(`${serverUrl}/auth/google/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ id_token: idToken }),
  });

  if (response.status === 200) {
    return response.json();
  } else if (response.status === 403) {
    throw new Error("Zugang nicht erlaubt. Bitte den Administrator kontaktieren.");
  } else if (response.status === 401) {
    throw new Error("Ungültiges Google-Token. Bitte erneut versuchen.");
  } else {
    const errorText = await response.text();
    throw new Error(errorText || `Serverfehler: ${response.status}`);
  }
}

export interface AiSettingsConfig {
  provider: "openrouter" | "anthropic" | "gemini" | "openai";
  apiKey: string;
  models: {
    photoScan: string;
    inventoryScan: string;
    enrich: string;
    suggest: string;
    imageGen: string;
  };
}

export interface AiModelInfo {
  id: string;
  name: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  supportsVision: boolean;
  provider: "openrouter" | "anthropic" | "gemini" | "openai";
}

export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const response = await apiFetch("/api/me");
    if (response.ok) {
      const data = await response.json();
      return !!data.isAdmin;
    }
    return false;
  } catch (e) {
    console.error("fetchIsAdmin failed:", e);
    return false;
  }
}

export async function loadAiSettings(): Promise<AiSettingsConfig> {
  const response = await apiFetch("/api/settings/ai");
  if (response.ok) {
    return response.json();
  }
  throw new Error("Fehler beim Laden der KI-Einstellungen.");
}

export async function saveAiSettings(config: AiSettingsConfig): Promise<void> {
  const response = await apiFetch("/api/settings/ai", {
    method: "POST",
    body: JSON.stringify(config),
  });
  if (response.ok) {
    return;
  }
  if (response.status === 403) {
    throw new Error("Keine Admin-Berechtigung.");
  }
  const errorText = await response.text();
  throw new Error(errorText || `Serverfehler beim Speichern: ${response.status}`);
}

export async function fetchAvailableModels(): Promise<AiModelInfo[]> {
  const response = await apiFetch("/api/settings/ai/models");
  if (response.ok) {
    return response.json();
  }
  throw new Error("Fehler beim Laden der verfügbaren Modelle.");
}

export async function testAiSettings(config: AiSettingsConfig): Promise<{ status: "success" | "error"; message: string }> {
  const response = await apiFetch("/api/settings/ai/test-connection", {
    method: "POST",
    body: JSON.stringify(config),
  });
  if (response.ok) {
    return response.json();
  }
  if (response.status === 403) {
    return { status: "error", message: "Keine Admin-Berechtigung." };
  }
  const errorText = await response.text();
  return { status: "error", message: errorText || `Serverfehler: ${response.status}` };
}


