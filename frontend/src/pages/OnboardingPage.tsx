import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { 
  Camera, 
  Smartphone, 
  AlertCircle, 
  RefreshCw, 
  FileText
} from "lucide-react";

import { useAuth } from "../App";
import { deriveKeys } from "../crypto/cryptoEngine";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { googleLogin, getServerUrl } from "../api/apiClient";

export default function OnboardingPage() {
  console.log("VITE_GOOGLE_CLIENT_ID is:", import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const { token } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();

  // Onboarding modes
  const isInviteMode = !!token;

  // Setup configuration states
  const [serverUrl, setServerUrl] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  // UI Flow States
  const [step, setStep] = useState<"choice" | "scan" | "manual" | "deriving" | "error">("choice");
  const [inviteStep, setInviteStep] = useState<"verifying" | "scan_key" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>("");
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);

  const qrReaderRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader-container";

  // If page loaded with invite token, verify token on server immediately
  useEffect(() => {
    if (isInviteMode && token) {
      verifyInviteToken(token);
    }
  }, [isInviteMode, token]);

  // Clean up QR Scanner when component unmounts
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // 1. Verify invitation token
  const verifyInviteToken = async (inviteToken: string) => {
    try {
      setInviteStep("verifying");
      const hostOrigin = window.location.origin;
      
      // Attempt verification against server (which is our current server origin)
      const response = await fetch(`${hostOrigin}/auth/invite/${inviteToken}`);
      
      if (response.ok) {
        const data = await response.json();
        // Set server details and user ID retrieved from invitation record
        setServerUrl(data.server_url);
        setUserId(data.user_id);
        setInviteStep("scan_key");
        // Trigger scanning for master key immediately
        startQrScanner(true);
      } else {
        const errorText = await response.text();
        setErrorMessage(errorText || "Einladungslink ist ungültig oder abgelaufen (Gültigkeit: 5 min).");
        setInviteStep("error");
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("Verbindungsfehler zum Server.");
      setInviteStep("error");
    }
  };

  // 2. Start HTML5 QR Scanner
  const startQrScanner = async (forMasterKeyOnly: boolean = false) => {
    setErrorMessage("");
    setStep(forMasterKeyOnly ? "scan" : "scan");
    setIsScanning(true);

    // Wait for the DOM element to render
    setTimeout(async () => {
      try {
        const qrScanner = new Html5Qrcode(scannerId);
        qrReaderRef.current = qrScanner;

        await qrScanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          (decodedText) => {
            // Handle Successful Scan
            stopScanner();
            if (forMasterKeyOnly) {
              handleMasterKeyScan(decodedText);
            } else {
              handleSetupQrScan(decodedText);
            }
          },
          () => {
            // Silence scan failure (fires constantly when no QR is in frame)
          }
        );
      } catch (err) {
        console.error("Camera initialisation failed", err);
        setErrorMessage("Kamera konnte nicht gestartet werden. Bitte manuell eingeben oder Kamerafreigabe prüfen.");
        setIsScanning(false);
        setStep("choice");
      }
    }, 100);
  };

  // 3. Stop HTML5 QR Scanner
  const stopScanner = async () => {
    if (qrReaderRef.current && qrReaderRef.current.isScanning) {
      try {
        await qrReaderRef.current.stop();
      } catch (e) {
        console.error("Failed to stop scanner", e);
      }
    }
    qrReaderRef.current = null;
    setIsScanning(false);
  };

  // 4. Parse scanned config JSON (First Device setup)
  const handleSetupQrScan = (text: string) => {
    try {
      const config = JSON.parse(text);
      if (!config.s || !config.u || !config.m) {
        throw new Error("Ungültiges QR-Format");
      }
      processLogin(config.s, config.u, config.m);
    } catch (e) {
      setErrorMessage("Der gescannte Code ist ungültig. Bitte scanne den korrekten Einrichtungs-QR-Code.");
      setStep("choice");
    }
  };

  // 5. Parse master key scan (Second Device setup)
  const handleMasterKeyScan = (masterKeyHex: string) => {
    const cleanKey = masterKeyHex.trim();
    if (cleanKey.length !== 64) {
      setErrorMessage("Ungültiger Master-Key. Der Schlüssel muss aus exakt 64 Hexadezimalzeichen bestehen.");
      setInviteStep("scan_key");
      return;
    }
    processLogin(serverUrl, userId, cleanKey);
  };

  // 6. Handle Manual Configuration Submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      const config = JSON.parse(manualInput);
      if (!config.s || !config.u || !config.m) {
        throw new Error("Missing parameters");
      }
      processLogin(config.s, config.u, config.m);
    } catch (e) {
      setErrorMessage("Ungültiges JSON-Format. Bitte überprüfe Deine Eingabe. (Erwartet: {\"s\":\"...\",\"u\":\"...\",\"m\":\"...\"})");
    }
  };

  // 7. Perform HKDF derivation and authentication call to Ktor backend
  const processLogin = async (sUrl: string, uId: string, mKey: string) => {
    setStep("deriving");
    try {
      // Import and derive keys client-side (E2EE)
      const { authKeyHashHex } = await deriveKeys(mKey);

      // Perform Auth Challenge/Login request to backend
      const response = await fetch(`${sUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: uId,
          auth_key_hash: authKeyHashHex,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Login verified, write keys and redirect
        await login(sUrl, uId, mKey, data.access_token);
        navigate("/recipes");
      } else {
        const errorText = await response.text();
        setErrorMessage(errorText || "Fehler beim Anmelden auf dem Server. Bitte überprüfe den QR-Code.");
        setStep("choice");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Verbindungsfehler zum Server. Ist die Server-URL korrekt erreichbar?");
      setStep("choice");
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    const credential = credentialResponse.credential;
    if (!credential) {
      setErrorMessage("Google ID-Token fehlt in der Antwort.");
      setStep("error");
      return;
    }
    setIsGoogleLoading(true);
    setErrorMessage("");
    try {
      const responseData = await googleLogin(credential);
      const sUrl = getServerUrl();
      await login(sUrl, responseData.user_id, responseData.master_key_hex, responseData.access_token);
      navigate("/recipes");
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Google-Login fehlgeschlagen.");
      setStep("error");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setErrorMessage("Google-Login fehlgeschlagen.");
    setStep("error");
  };

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-light via-background to-background p-4">
        {/* Onboarding Container */}
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl transition-all duration-300 md:p-8 animate-scale-in">
          
          {/* Header logo/welcome */}
          <div className="flex flex-col items-center text-center gap-2.5 mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl shadow-lg">
              🍳
            </div>
            <h1 className="text-3xl font-black tracking-tight text-on-surface">OmniNom</h1>
            <p className="text-base text-on-surface-muted">
              {isInviteMode 
                ? "Zweites Gerät mit Deinem Haushalt koppeln" 
                : "Sicheres Rezeptbuch & Einkaufsplaner"}
            </p>
          </div>

          {/* Global Error Banner */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-error/10 p-4 text-sm text-error font-semibold">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* --- INVITATION LINKING FLOW (DEVICE 2) --- */}
          {isInviteMode && (
            <div>
              {inviteStep === "verifying" && (
                <div className="flex flex-col items-center py-6 gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-semibold">Einladungslink wird überprüft...</p>
                </div>
              )}

              {inviteStep === "scan_key" && (
                <div className="space-y-6">
                  <div className="rounded-2xl bg-primary-light/50 p-5 border border-primary/20 space-y-2.5">
                    <h3 className="text-base font-bold text-primary flex items-center gap-2">
                      <Smartphone size={20} /> Schritt 2: Master-Key scannen
                    </h3>
                    <p className="text-sm leading-relaxed text-on-surface-muted font-medium">
                      Der Einladungslink war erfolgreich. Um die E2EE-Verschlüsselung einzurichten, 
                      <strong> zeige den Master-Key QR-Code auf Deinem ersten Gerät an</strong> und scanne ihn mit diesem Gerät.
                    </p>
                  </div>

                  {isScanning ? (
                    <div className="space-y-4">
                      <div id={scannerId} className="w-full overflow-hidden rounded-xl border-2 border-primary bg-black shadow-inner" />
                      <button 
                        onClick={() => { stopScanner(); setInviteStep("scan_key"); }}
                        className="w-full h-12 rounded-xl border border-border text-sm font-bold hover:bg-muted cursor-pointer flex items-center justify-center"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => startQrScanner(true)}
                      className="w-full h-14 flex items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-3 font-extrabold text-white hover:bg-primary-hover shadow-md transition-all cursor-pointer text-sm"
                    >
                      <Camera size={20} />
                      <span>Master-Key scannen</span>
                    </button>
                  )}
                </div>
              )}

              {inviteStep === "error" && (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-on-surface-muted">Bitte fordere auf Deinem ersten Gerät einen neuen Einladungslink an.</p>
                  <button 
                    onClick={() => navigate("/onboarding")}
                    className="w-full h-12 rounded-xl bg-muted text-sm font-bold hover:bg-border cursor-pointer flex items-center justify-center"
                  >
                    Zurück zum Start
                  </button>
                </div>
              )}
            </div>
          )}

          {/* --- STANDARD FIRST TIME SETUP FLOW (DEVICE 1) --- */}
          {!isInviteMode && (
            <div>
              {step === "choice" && (
                <div className="space-y-4">
                  {/* Google Login Component */}
                  <div className="flex flex-col items-center gap-3 w-full">
                    {isGoogleLoading ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary py-2 animate-pulse">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Google-Login wird verarbeitet...</span>
                      </div>
                    ) : (
                      <div className="w-full flex justify-center">
                        <GoogleLogin
                          onSuccess={handleGoogleSuccess}
                          onError={handleGoogleError}
                          useOneTap
                          theme="filled_blue"
                          shape="pill"
                          width="350px"
                        />
                      </div>
                    )}
                    <div className="flex items-center w-full my-2">
                      <div className="flex-1 border-t border-border" />
                      <span className="px-3 text-xs text-on-surface-muted font-bold uppercase tracking-wider">— oder —</span>
                      <div className="flex-1 border-t border-border" />
                    </div>
                  </div>

                  <p className="text-sm text-center text-on-surface-muted mb-6 leading-relaxed">
                    Um die App einzurichten, scanne den Einrichtungs-QR-Code, der im Terminal Deines Ubuntu-Heimservers ausgegeben wurde.
                  </p>

                  <button 
                    onClick={() => startQrScanner(false)}
                    className="w-full h-14 flex items-center justify-center gap-3 rounded-xl bg-primary px-4 text-base font-extrabold text-white hover:bg-primary-hover shadow-md transition-all cursor-pointer"
                  >
                    <Camera size={24} />
                    <span>Einrichtungs-QR scannen</span>
                  </button>

                  <div className="flex items-center my-4">
                    <div className="flex-1 border-t border-border" />
                    <span className="px-3 text-sm text-on-surface-muted font-bold uppercase tracking-wider">oder</span>
                    <div className="flex-1 border-t border-border" />
                  </div>

                  <button 
                    onClick={() => setStep("manual")}
                    className="w-full h-12 flex items-center justify-center gap-2.5 rounded-xl border border-border px-4 text-sm font-extrabold hover:bg-muted transition-all cursor-pointer"
                  >
                    <FileText size={20} className="text-on-surface-muted" />
                    <span>JSON-Konfiguration eingeben</span>
                  </button>
                </div>
              )}

              {step === "scan" && (
                <div className="space-y-4">
                  <div id={scannerId} className="w-full overflow-hidden rounded-xl border-2 border-primary bg-black shadow-inner" />
                  <button 
                    onClick={() => { stopScanner(); setStep("choice"); }}
                    className="w-full h-12 rounded-xl border border-border text-sm font-bold hover:bg-muted cursor-pointer flex items-center justify-center"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              {step === "manual" && (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-on-surface-muted uppercase">JSON-Payload</label>
                    <textarea 
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder='{"s":"https://...","u":"uuid","m":"hex_key"}'
                      rows={5}
                      className="w-full rounded-xl border border-border bg-background p-4 text-sm font-mono focus:border-primary focus:outline-none"
                      required
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setStep("choice")}
                      className="flex-1 h-12 rounded-xl border border-border text-sm font-bold hover:bg-muted cursor-pointer flex items-center justify-center"
                    >
                      Abbrechen
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 h-12 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary-hover cursor-pointer flex items-center justify-center"
                    >
                      Verbinden
                    </button>
                  </div>
                </form>
              )}

              {step === "deriving" && (
                <div className="flex flex-col items-center py-8 gap-4">
                  <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="font-extrabold text-base">Schlüssel werden abgeleitet...</p>
                    <p className="text-sm text-on-surface-muted mt-1">Dies geschieht lokal im Browser via Web Crypto API.</p>
                  </div>
                </div>
              )}

              {step === "error" && (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-on-surface-muted">Bitte versuche es erneut oder nutze eine andere Anmeldemethode.</p>
                  <button 
                    onClick={() => setStep("choice")}
                    className="w-full h-12 rounded-xl bg-muted text-sm font-bold hover:bg-border cursor-pointer flex items-center justify-center"
                  >
                    Zurück zum Start
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
