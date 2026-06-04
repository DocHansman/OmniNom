# PROJECT BLUEPRINT: OmniNom 🍳 (PWA Edition v2.1)
Target Platform: Progressive Web App (Android & iOS via Browser)
Hosting: Self-hosted Ubuntu Home Server
Security: E2EE (Web Crypto API, AES-GCM-256)
Design System: shadcn/ui + Tailwind CSS – Warm Amber Palette
Stack: React 19 + Vite | Ktor Backend | PostgreSQL | Docker | OpenRouter Vision API

---

## I. WARUM PWA STATT NATIVE APP

| | PWA (diese Version) | KMP Native (alt) |
|---|---|---|
| iOS-Verteilung | Browser → „Zum Home-Bildschirm" | Apple Developer Konto (99 $/Jahr) + TestFlight |
| Codebase | 1x Frontend (React) | 3x (shared KMP + Android + iOS) |
| Xcode erforderlich | ❌ | ✅ |
| Offline-Modus | ✅ (Service Worker) | ✅ (SQLDelight) |
| WakeLock (Kochmodus) | ✅ Android/Chrome, ⚠️ iOS Safari nicht unterstützt | ✅ beide Plattformen |
| Push-Notifications | ✅ ab iOS 16.4 (nach Installation) | ✅ |

> **iOS WakeLock-Workaround:** Im Kochmodus wird auf iOS ein Banner angezeigt: „Tipp: Automatische Bildschirmsperre unter Einstellungen → Anzeige → Nie (für die Kochsession) deaktivieren."

---

## II. INTEGRIERTE DEV-AI RULES (WICHTIG: Bitte strikt befolgen!)

Du agierst als Senior Full-Stack-Entwickler. Da der Entwickler über Terminal-Grundkenntnisse verfügt, aber kein DevOps-Experte ist, musst du bei jeder Code-Generierung folgende Regeln einhalten:

1. **Vollständiges Frontend & Backend:** Generiere niemals nur den Server-Code. Wenn ein Prompt das Frontend betrifft, liefere vollständige React-Komponenten, Hooks und Dateipfade.
2. **Proaktive UX-Verbesserungen:** Analysiere bei jedem Schritt das Benutzererlebnis. Implementiere selbstständig: WakeLock-Modus (Chrome/Android) mit iOS-Fallback-Banner, haptisches Feedback via Vibration API beim Beenden eines Kochschritts, intelligente Fehlermeldungen bei Netzwerkabbrüchen mit Offline-Queue-Hinweis.
3. **Keine halben Sachen:** Gib niemals unvollständigen Code oder Platzhalter (`// TODO`) aus. Alle Dateien müssen vollständig kopierbar sein.
4. **Infrastruktur via Terminal:** Liefere bei Server/Docker/UFW-Änderungen exakte, zeilenweise Terminal-Befehle.
5. **Vollständige Konfigurationsdateien:** `vite.config.ts`, `docker-compose.yml`, `manifest.json`, Tailwind-Konfig – immer als kompletter, kopierbarer Block.

---

## III. ARCHITEKTUR & DATEI-STRUKTUR

```
OmniNom/
├── frontend/                            # React 19 + Vite PWA
│   ├── public/
│   │   ├── manifest.json                # PWA-Manifest (Name, Icons, Theme-Color)
│   │   └── icons/                       # App-Icons (192x192, 512x512)
│   ├── src/
│   │   ├── crypto/
│   │   │   └── cryptoEngine.ts          # Web Crypto API: HKDF + AES-GCM-256
│   │   ├── db/
│   │   │   └── localDb.ts               # IndexedDB via idb (lokaler Cache)
│   │   ├── api/
│   │   │   └── apiClient.ts             # Fetch-Wrapper: JWT-Auth, Offline-Queue, Multipart
│   │   ├── utils/
│   │   │   └── unitConverter.ts         # Einheiten-Konvertierung (g↔ml↔TL↔EL↔Stück)
│   │   ├── hooks/
│   │   │   ├── useRecipes.ts            # Rezept-State, CRUD, Sync
│   │   │   ├── useMealPlan.ts           # Wochenplan-State
│   │   │   ├── useInventory.ts          # Vorrats-State + Einkaufslisten-Berechnung
│   │   │   ├── useShoppingList.ts       # Einkaufsliste + Abhak-Logik
│   │   │   └── useSync.ts               # WebSocket Echtzeit-Sync
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn/ui Basis-Komponenten
│   │   │   ├── RecipeCard.tsx           # Karte: Foto, Titel, Tags, Bewertung, Kochzeit
│   │   │   ├── RecipeEditor.tsx         # Vollständiges CRUD-Formular (Erstellen & Bearbeiten)
│   │   │   ├── PhotoCapture.tsx         # Kamera/Galerie-Upload + Vorschau
│   │   │   ├── AiScanOverlay.tsx        # Lade-Animation während AI-Verarbeitung
│   │   │   ├── StarRating.tsx           # 1-5 Sterne Bewertungskomponente
│   │   │   ├── NutritionDisplay.tsx     # Makro-Übersicht (Kalorien, Protein, Fett, Carbs)
│   │   │   ├── UnitConverterWidget.tsx  # Inline Einheiten-Konverter
│   │   │   ├── DietaryTagPicker.tsx     # Tag-Auswahl (vegan, glutenfrei etc.)
│   │   │   ├── CookingTimeline.tsx      # Vertikale Schritt-Timeline
│   │   │   ├── IngredientConsumptionDialog.tsx
│   │   │   └── InstallPrompt.tsx        # PWA Installationshinweis
│   │   ├── pages/
│   │   │   ├── OnboardingPage.tsx       # QR-Scanner + Key-Ableitung
│   │   │   ├── RecipesPage.tsx          # Grid, Suche, Filter, Import-Leiste
│   │   │   ├── RecipeDetailPage.tsx     # Detailansicht: Foto, Nährwerte, Bewertung, Bearbeiten
│   │   │   ├── MealPlanPage.tsx         # Wochenplan
│   │   │   ├── InventoryPage.tsx        # Vorratsliste
│   │   │   ├── ShoppingPage.tsx         # Kategorisierte Einkaufsliste
│   │   │   └── CookingPage.tsx          # Kochmodus mit Timer & Timeline
│   │   ├── App.tsx                      # Router + adaptive Navigation
│   │   └── main.tsx
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── ktorBackend/
│   ├── src/main/kotlin/
│   │   ├── routes/
│   │   │   ├── AuthRoutes.kt            # /auth/challenge, /auth/login, /auth/invite
│   │   │   ├── SyncRoutes.kt            # /api/sync (GET/POST encrypted_payload)
│   │   │   ├── ScraperRoutes.kt         # /api/scrape?url= (Schema.org JSON-LD)
│   │   │   ├── AiRoutes.kt              # /api/recipe/from-photo (OpenRouter Vision)
│   │   │   ├── PhotoRoutes.kt           # /api/photos (Upload, Serve)
│   │   │   └── WebSocketRoutes.kt       # /ws/sync
│   │   ├── models/                      # Exposed ORM Tabellen
│   │   ├── plugins/
│   │   └── Application.kt
│   ├── scripts/
│   │   ├── generate-qr.sh               # User anlegen + QR-Code ausgeben
│   │   └── backup.sh                    # pg_dump + Rotation alter Backups
│   └── Dockerfile
│
├── docker-compose.yml                   # Nginx + Ktor + PostgreSQL
├── nginx.conf                           # Reverse Proxy + PWA-Header + /photos static
└── .env.example                         # POSTGRES_PASSWORD, JWT_SECRET, OPENROUTER_API_KEY, SERVER_URL
```

---

## IV. FEATURE-FLOW & LOGIK (vollständig)

### Rezept-Management
1. **Manuell erstellen:** Vollständiges Formular mit allen Feldern (Titel, Foto, Zutaten mit Menge+Einheit, Schritte mit optionaler Zeit, Tags, Portionen, Quelle). Inline-Bearbeitung jederzeit möglich.
2. **URL-Import:** Backend-Scraper extrahiert Schema.org JSON-LD aus Kochseiten-Links → bearbeitbare Vorschau.
3. **AI Foto-Scan:** Kochbuch oder Rezeptkarte fotografieren → AI extrahiert alle Felder automatisch → bearbeitbare Vorschau.
4. **Bewertung:** 1-5 Sterne pro Rezept, persistent gespeichert. Sortierung im Grid nach Bewertung möglich.
5. **Rezept-Foto:** Eigenes Foto des Gerichts per Kamera oder Galerie. Wird auf dem Server gespeichert und in der Karte angezeigt.
6. **Dietary Tags:** Standardisierte Tags (vegan, vegetarisch, glutenfrei, laktosefrei, Low-Carb, <30min, schnell, Meal-Prep). Werden beim AI-Scan automatisch vorgeschlagen, manuell anpassbar.
7. **Nährwertinfos:** Kalorien, Protein, Fett, Kohlenhydrate pro Portion. Werden beim AI-Scan extrahiert, manuell editierbar. Anzeige in der Detailansicht und optional im Kochmodus.

### Einkauf & Haushalt
8. **Intelligente Einkaufsliste:** `Bedarf (Rezept × Portionen) − Vorrat = Einkaufsmenge`. Automatisch beim Hinzufügen zum Wochenplan.
9. **Portionsgrößen-Skalierung:** Zutatenmengen werden proportional zur gewählten Personenzahl skaliert.
10. **Einheiten-Konverter:** Inline-Widget im Rezept und beim Einkauf (z.B. „2 EL = 30g", „500ml = 0,5l"). Unterstützte Einheiten: g, kg, ml, l, TL, EL, Tasse, Stück, Prise.
11. **Einkaufslisten-Kategorien:** Automatische Gruppierung nach Supermarkt-Bereichen.
12. **Vorratstransfer:** Abhaken auf Einkaufsliste → sofort dem Vorrat gutgeschrieben.

### Kochmodus
13. **Schritt-Timer:** Jeder Schritt kann eine Zeitangabe haben → Countdown mit Vibration-Alarm.
14. **Verbrauch-Dialog:** Am Ende des Kochmodus: Checkbox-Liste welche Zutaten verbraucht wurden.
15. **WakeLock:** Chrome/Android nativ, iOS mit Hinweis-Banner.

### Sync & Infrastruktur
16. **Echtzeit-Sync:** WebSocket – Änderungen erscheinen sofort auf beiden Geräten.
17. **Offline-Queue:** Änderungen im Offline-Fall werden lokal gespeichert und beim Reconnect synchronisiert.
18. **Automatisches Server-Backup:** Täglicher pg_dump per Cron-Job, 7 Tage Rotation.

---

## V. AI FOTO-ZU-REZEPT: TECHNISCHER ABLAUF

```
[Nutzer fotografiert Kochbuch-Seite]
        │
        ▼
[Frontend: PhotoCapture.tsx]
  - navigator.mediaDevices.getUserMedia() oder <input capture="camera">
  - Bild wird client-seitig auf max. 1280px + 85% JPEG-Qualität komprimiert (Canvas API)
  - POST /api/recipe/from-photo (multipart/form-data)
        │
        ▼
[Backend: AiRoutes.kt]
  - Empfängt Bild, prüft Dateigröße (max. 5MB)
  - POST an https://openrouter.ai/api/v1/chat/completions
    Model: "google/gemini-2.0-flash"  ← günstig (~0,001 € pro Scan), exzellent für gedruckten Text
    System-Prompt: "Du bist ein Rezept-Extraktor. Analysiere das Bild und gib ein
                    strukturiertes JSON-Objekt zurück. Antworte NUR mit validem JSON."
    User-Content: [Bild als base64] + JSON-Schema (siehe unten)
        │
        ▼
[Backend: JSON-Antwort parsen & zurückgeben]
        │
        ▼
[Frontend: AiScanOverlay.tsx → RecipeEditor.tsx vorausgefüllt]
  - Nutzer kontrolliert und korrigiert alle Felder
  - Erst nach expliziter Bestätigung wird das Rezept gespeichert
```

### Angefordertes JSON-Schema vom AI-Modell

```json
{
  "title": "string",
  "servings": "number",
  "cookingTimeMinutes": "number",
  "source": "string (z.B. Buchname oder leer)",
  "dietaryTags": ["vegan | vegetarisch | glutenfrei | laktosefrei | low-carb"],
  "ingredients": [
    { "name": "string", "amount": "number", "unit": "g|kg|ml|l|TL|EL|Stück|Prise|Tasse" }
  ],
  "steps": [
    { "order": "number", "description": "string", "timerMinutes": "number|null" }
  ],
  "nutrition": {
    "caloriesPerServing": "number",
    "proteinG": "number",
    "fatG": "number",
    "carbsG": "number"
  }
}
```

> **Hinweis:** Das Modell extrahiert Nährwerte nur wenn sie im Bild sichtbar sind, ansonsten schätzt es auf Basis der Zutaten. Der Nutzer sieht immer die Möglichkeit, die Werte manuell zu korrigieren.

---

## VI. KRYPTO-, AUTH- & SYNC-PROTOKOLL (E2EE)

### 1. Initiales Setup – QR-Code-Kopplung

Der Ubuntu-Server generiert per Bash-Skript folgenden QR-Code:

```json
{
  "s": "https://deine-instanz.cloudflare-tunnel.com",
  "u": "user_id_uuid",
  "m": "64_stelliger_hex_master_key"
}
```

Gerät 1 scannt den QR-Code. Gerät 2 erhält via `/auth/invite` einen kurzlebigen Einladungslink (5 Minuten gültig) – nur Server-URL + einmaliger Token, kein Master-Key im zweiten QR. Der Master-Key wird dann verschlüsselt Gerät-zu-Gerät über den Server als Relay übertragen.

### 2. Schlüsselableitung im Browser (Web Crypto API)

```
Master Key (32 Bytes)
    ├─ HKDF(salt="auth_v1")   → Auth-Key  → SHA-256-Hash → JWT-Authentifizierung
    └─ HKDF(salt="data_v1")   → Crypto-Key → verbleibt in sessionStorage
```

### 3. Datenverschlüsselung

Alle Rezeptdetails werden als AES-GCM-256-Blob verschlüsselt. IDs, Zeitstempel, Foto-Pfade und Dietary-Tags bleiben im Klartext (werden für Suche, Filterung und Konfliktlösung benötigt).

### 4. Foto-Speicherung

Rezeptfotos werden **unverschlüsselt** auf dem Server gespeichert (Volume: `/data/photos/`), zugänglich nur über authentifizierte Routen. Für den privaten Heimserver ist das ausreichend.

### 5. JWT-Auth
- `access_token` (15 Min) + `refresh_token` (30 Tage, httpOnly Cookie)
- Automatischer Refresh im `apiClient.ts`

---

## VII. DESIGN-SYSTEM & ADAPTIVE UI

### Tailwind-Farbpalette (tailwind.config.ts)

```js
colors: {
  primary:         '#C17C3A',  // Warmes Amber
  'primary-light': '#F2E6D5',
  background:      '#FBF7F0',  // Cremeweiß
  surface:         '#FBF7F0',
  'on-surface':    '#3D2B1A',  // Dunkles Braun
  secondary:       '#7A5C3F',  // Warmes Braun
}
```

### Layout-Anpassung

- **Smartphone (< 768px):** Bottom Navigation Bar (5 Tabs: Rezepte, Wochenplan, Kochen, Vorrat, Einkaufen)
- **Tablet/Desktop (≥ 768px):** Sidebar Navigation links (240px)
- **Kochmodus:** Vertikale Timeline links, Inhaltsbereich rechts. Mobil: horizontaler Fortschrittsindikator oben.

### RecipeCard (Bestandteile)
- Rezeptfoto (mit Fallback-Illustration wenn kein Foto)
- Titel, Kochzeit, Portionen
- Dietary Tags als farbige Chips
- StarRating (1-5 Sterne, klickbar)
- Nährwert-Kurzinfo (Kalorien pro Portion)

---

## VIII. DATENBANK-SCHEMA (Exposed ORM)

```sql
users:          id (UUID), auth_key_hash, created_at
recipes:        id (UUID), user_id, encrypted_payload (TEXT),
                photo_path (TEXT nullable), dietary_tags (TEXT[]),
                rating (INT 1-5 nullable), updated_at, is_deleted
meal_plan:      id, user_id, recipe_id, week_date, servings, updated_at
inventory:      id, user_id, encrypted_payload, updated_at
shopping_list:  id, user_id, encrypted_payload, is_checked, updated_at
```

> `encrypted_payload` enthält: Titel, Zutaten (mit Menge, Einheit, Name), Schritte, Nährwerte, Quelle.
> Felder außerhalb des Payloads (photo_path, dietary_tags, rating) bleiben unverschlüsselt für Suche/Filter.

---

## IX. SCHRITT-FÜR-SCHRITT UMSETZUNGS-PROMPTS

---

### PROMPT 1: Ktor-Backend, Docker, Server-Backup & Infrastruktur

```
Erstelle das vollständige Ktor-Backend-Projekt für eine private Haushalts-Koch-App.

BACKEND-ENDPUNKTE:
- POST /auth/login          → JWT access_token (15min) + refresh_token (httpOnly Cookie, 30 Tage)
- POST /auth/refresh        → neuer access_token
- POST /auth/invite         → generiert 5-Minuten-Einladungstoken für zweites Gerät
- GET  /api/sync            → gibt alle verschlüsselten Payloads des Users zurück (recipes, inventory, shopping)
- POST /api/sync            → nimmt Array von { id, entity_type, encrypted_payload, updated_at, is_deleted } entgegen
- POST /api/scrape          → Schema.org JSON-LD Extraktor (URL-Parameter), SSRF-Schutz: blockt private IPs
- POST /api/recipe/from-photo → Multipart-Upload, leitet an OpenRouter weiter (eigener AiRoutes.kt)
- GET  /api/photos/:filename → serviert Foto-Dateien (Auth-geschützt)
- POST /api/photos          → speichert hochgeladenes Rezeptfoto in /data/photos/, gibt Pfad zurück
- WS  /ws/sync              → WebSocket: broadcast { entity_type, id } an alle Sessions des Users

DATENBANK-SCHEMA (Exposed ORM, PostgreSQL):
users:         id UUID PK, auth_key_hash TEXT, created_at TIMESTAMP
recipes:       id UUID PK, user_id UUID FK, encrypted_payload TEXT,
               photo_path TEXT NULL, dietary_tags TEXT[] DEFAULT '{}',
               rating INT NULL CHECK(rating BETWEEN 1 AND 5),
               updated_at TIMESTAMP, is_deleted BOOLEAN DEFAULT false
meal_plan:     id UUID PK, user_id UUID FK, recipe_id UUID, week_date DATE, servings INT, updated_at TIMESTAMP
inventory:     id UUID PK, user_id UUID FK, encrypted_payload TEXT, updated_at TIMESTAMP
shopping_list: id UUID PK, user_id UUID FK, encrypted_payload TEXT, is_checked BOOLEAN, updated_at TIMESTAMP

DOCKER-INFRASTRUKTUR:
Erstelle docker-compose.yml mit vier Services:
1. postgres:16          – Volume für Datenpersistenz unter /data/postgres
2. ktor-backend         – aus Dockerfile, Port 8080 intern, Volume /data/photos für Rezeptfotos
3. nginx                – Reverse Proxy Port 80: /api → Ktor, /ws → Ktor WebSocket, /photos → static mit Auth-Check, / → /frontend/dist
4. backup-cron          – Alpine-Container mit pg_dump Cron-Job

BACKUP-SKRIPT (scripts/backup.sh):
- Täglicher pg_dump nach /data/backups/backup_YYYY-MM-DD.sql.gz
- Rotation: Dateien älter als 7 Tage werden gelöscht
- Ausgabe: "Backup erfolgreich: backup_YYYY-MM-DD.sql.gz (X MB)"
- Cron-Eintrag: täglich um 03:00 Uhr

nginx.conf:
- PWA-Header: Cache-Control no-cache für index.html + manifest.json, max-age=31536000 für /assets/*
- WebSocket-Proxy-Header (Upgrade, Connection)
- /photos: nur mit gültigem JWT-Cookie (auth_request zu Ktor)

UFW-Befehle für Ubuntu: nur Port 80 öffentlich, alle anderen nur intern.
.env.example mit: POSTGRES_PASSWORD, JWT_SECRET, OPENROUTER_API_KEY, SERVER_URL
```

---

### PROMPT 2: AI Foto-zu-Rezept (OpenRouter Vision)

```
Erstelle die vollständige AI-Scan-Funktionalität: Backend-Route + Frontend-Komponenten.

BACKEND (ktorBackend/src/main/kotlin/routes/AiRoutes.kt):
POST /api/recipe/from-photo:
- Nimmt multipart/form-data mit Feld "image" (JPEG/PNG, max 5MB) entgegen
- Liest OPENROUTER_API_KEY aus Umgebungsvariable
- Sendet POST an https://openrouter.ai/api/v1/chat/completions:
  - model: "google/gemini-2.0-flash"
  - messages:
    - system: "Du bist ein präziser Rezept-Extraktor. Analysiere das Bild und antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt ohne Markdown-Codeblöcke."
    - user: [Bild als base64 data URL] + "Extrahiere das Rezept aus diesem Bild im folgenden Schema: {JSON-Schema}"
  - Das JSON-Schema enthält: title, servings, cookingTimeMinutes, source, dietaryTags[], ingredients[{name,amount,unit}], steps[{order,description,timerMinutes}], nutrition{caloriesPerServing,proteinG,fatG,carbsG}
- Parst die JSON-Antwort, validiert das Schema
- Fehlerbehandlung: Timeout nach 30s, ungültiges JSON → HTTP 422 mit Fehlermeldung
- Gibt das geparste JSON-Objekt zurück

FRONTEND:

PhotoCapture.tsx:
- Zwei Buttons: "Kamera" (capture="camera") und "Galerie" (input type=file, accept image/*)
- Komprimiert Bild client-seitig mit Canvas API auf max. 1280px längste Seite, 85% JPEG-Qualität
- Zeigt Vorschau des ausgewählten Bildes
- "Rezept scannen"-Button löst POST /api/recipe/from-photo aus

AiScanOverlay.tsx:
- Vollbild-Overlay während AI verarbeitet (2-8 Sekunden)
- Animierter Amber-Spinner mit rotierenden Texten: "Lese Zutaten...", "Erkenne Schritte...", "Berechne Nährwerte..."
- Abbrechen-Button (bricht fetch mit AbortController ab)

Integration in RecipesPage.tsx:
- FAB (Floating Action Button) mit drei Optionen: "Manuell erstellen", "URL importieren", "Foto scannen"
- Öffnet Speed-Dial-Menü nach Klick auf FAB

Nach erfolgreichem Scan: RecipeEditor.tsx öffnet sich mit vorausgefüllten Feldern.
Alle Felder sind editierbar, bevor das Rezept gespeichert wird.
Snackbar: "Rezept erkannt – bitte prüfen und ggf. korrigieren"
```

---

### PROMPT 3: Server-QR-Skript & Auth-Flow

```
Erstelle das Bash-Skript unter ktorBackend/scripts/generate-qr.sh.

Das Skript soll:
1. Einen neuen User in der PostgreSQL-Datenbank anlegen (UUID generieren)
2. Einen 32-Byte-Master-Key (64 Hex-Zeichen) via /dev/urandom generieren
3. Den Auth-Key-Hash (SHA-256 des HKDF-Auth-Schlüssels) in der Datenbank speichern
4. Das Verbindungs-JSON { "s": "$SERVER_URL", "u": "$USER_UUID", "m": "$MASTER_KEY" } als scanbaren ASCII-Art QR-Code direkt im Ubuntu-Terminal ausgeben (qrencode-Tool)
5. Eine Warnung ausgeben: "ACHTUNG: Diesen QR-Code nur auf deinem eigenen Bildschirm scannen."

Zusätzlich: Endpunkt POST /auth/invite im Backend
- Gibt einen einmaligen Token zurück (UUID, 5 Minuten TTL, in PostgreSQL gespeichert)
- Zweites Gerät ruft GET /auth/invite/:token auf → erhält Server-URL + User-UUID, kein Master-Key
- Master-Key-Übertragung: Gerät 1 zeigt einen zweiten QR-Code lokal auf dem Bildschirm an (in der App), der NUR den Master-Key enthält – Gerät 2 scannt diesen zweiten Code

Das Script liest SERVER_URL und POSTGRES_URL aus der .env-Datei.
Liefere die Installationsbefehle für qrencode auf Ubuntu.
```

---

### PROMPT 4: React PWA Grundgerüst + Design System

```
Erstelle das vollständige React 19 + Vite Frontend-Projekt unter frontend/.

SETUP:
Abhängigkeiten: react-router-dom v6, @tanstack/react-query v5, idb, html5-qrcode, vite-plugin-pwa, lucide-react (Icons)
shadcn/ui initialisieren.

Tailwind-Farbpalette in tailwind.config.ts:
  primary: '#C17C3A', primary-light: '#F2E6D5',
  background: '#FBF7F0', on-surface: '#3D2B1A', secondary: '#7A5C3F'

CSS-Variablen in globals.css für shadcn/ui kompatibel setzen.

PWA (vite.config.ts):
- vite-plugin-pwa, Workbox Network-First für /api, Cache-First für Assets
- manifest.json: Name "OmniNom 🍳", theme_color #C17C3A, background_color #FBF7F0, display standalone

ADAPTIVE NAVIGATION (App.tsx):
- Breakpoint 768px: unter → Bottom Nav Bar, ab → Sidebar (240px)
- 5 Tabs: Rezepte (BookOpen), Wochenplan (Calendar), Kochen (ChefHat), Vorrat (Package), Einkaufen (ShoppingCart)
- Aktiver Tab in Primary-Amber hervorgehoben

INSTALL-PROMPT (InstallPrompt.tsx):
- Android/Chrome: beforeinstallprompt-Event für nativen Dialog
- iOS/Safari: Schritt-für-Schritt-Anleitung mit Share-Icon-Darstellung
- Erscheint als Snackbar nach 30s, localStorage-Flag verhindert Wiederholung
```

---

### PROMPT 5: Krypto-Modul & Onboarding

```
Erstelle das vollständige Krypto-Modul und den Onboarding-Flow.

CRYPTO ENGINE (src/crypto/cryptoEngine.ts) – nur Web Crypto API, keine Bibliotheken:
- deriveKeys(masterKeyHex: string): Promise<{authKey: CryptoKey, cryptoKey: CryptoKey}>
  masterKeyHex → Uint8Array → importKey(raw) → HKDF SHA-256
  authKey: info=UTF8("OmniNom Auth"), salt=UTF8("auth_v1")
  cryptoKey: info=UTF8("OmniNom Data"), salt=UTF8("data_v1")
- encrypt(cryptoKey, plaintext): Promise<string>  → Base64(12-Byte-IV + AES-GCM-256-Ciphertext)
- decrypt(cryptoKey, ciphertext): Promise<string>
- hashAuthKey(authKey): Promise<string>  → SHA-256 Export als Hex

LOCAL DB (src/db/localDb.ts) – idb:
IndexedDB-Stores: recipes, mealPlan, inventory, shoppingList, syncMeta
Funktionen: getAll(store), upsert(store, item), markDeleted(store, id), getPendingSync()
cryptoKey NICHT in IndexedDB – nur sessionStorage.

EINHEITEN-KONVERTER (src/utils/unitConverter.ts):
Konvertierungstabelle und Funktionen für:
g ↔ kg, ml ↔ l, TL (5ml) ↔ EL (15ml) ↔ Tasse (240ml), Stück und Prise (keine Konvertierung)
convert(amount, fromUnit, toUnit): number | null
formatAmount(amount, unit): string  (z.B. "1,5 kg" statt "1500 g" ab 1000g)

UnitConverterWidget.tsx:
- Kleine Inline-Komponente: Eingabefeld + Einheit-Dropdown → zeigt Äquivalente in anderen Einheiten
- Erscheint als Tooltip/Popover bei Tap auf eine Zutatenmenge

ONBOARDING PAGE (OnboardingPage.tsx):
Schritt 1: QR-Scanner (html5-qrcode) → JSON mit s, u, m parsen
Schritt 2: deriveKeys() → Amber-Spinner Ladeanimation
Schritt 3: POST /auth/login {user_id, auth_key_hash} → JWT
Schritt 4: cryptoKey in sessionStorage, JWT in React Context
Schritt 5: Slide-In-Animation → RecipesPage

Fehlerbehandlung für: ungültiger QR, Netzwerkfehler, falscher Auth-Key.
Zweites Gerät: Sonderfall-Erkennung wenn URL /invite/:token enthält – überspringt QR-Scan,
zeigt stattdessen "Scan den Master-Key QR-Code auf dem ersten Gerät".
```

---

### PROMPT 6: Rezept-CRUD, Tags, Bewertung, Fotos & Nährwerte

```
Erstelle alle Rezept-Management-Screens und Komponenten.

STAR RATING (StarRating.tsx):
- 5 Sterne, klickbar, halbe Sterne optional
- Amber-Farbe für gefüllte Sterne, Outline für leere
- Optimistic Update: Rating sofort lokal anzeigen, dann zu Backend synchronisieren

DIETARY TAG PICKER (DietaryTagPicker.tsx):
Vordefinierte Tags: vegan, vegetarisch, glutenfrei, laktosefrei, low-carb, <30min, Meal-Prep, scharf, Suppe, Backen
- Mehrfachauswahl als Toggle-Chips
- Amber-Hintergrund für aktive Tags

NUTRITION DISPLAY (NutritionDisplay.tsx):
- Kompakte Darstellung: 4 Makros als kleine Cards (Kalorien, Protein, Fett, Carbs)
- Werte werden per servings skaliert wenn Portionsgröße geändert wird
- Optional: kleines Balkendiagramm (CSS-only, kein Chart.js) für Makro-Verhältnis

RECIPE EDITOR (RecipeEditor.tsx) – vollständiges Formular:
Felder:
- Foto: PhotoCapture.tsx eingebettet (Kamera / Galerie / kein Foto)
- Titel (Pflichtfeld), Quelle (optional, z.B. Buchname, URL)
- Portionen (Number-Input mit +/- Buttons), Kochzeit in Minuten
- Dietary Tags: DietaryTagPicker.tsx
- Zutaten: dynamische Liste, je Zeile: Menge (Number) + Einheit (Dropdown: g/kg/ml/l/TL/EL/Tasse/Stück/Prise) + Name
  - Zeile hinzufügen/entfernen, Drag-to-reorder
- Schritte: dynamische Liste, je Zeile: Beschreibung (Textarea) + optionale Zeit in Minuten
  - Zeile hinzufügen/entfernen, Drag-to-reorder
- Nährwerte: 4 Number-Inputs (Kalorien, Protein kcal/g, Fett g, Carbs g pro Portion) – alle optional
- Bewertung: StarRating.tsx
Validierung: Titel Pflichtfeld, Zutaten min. 1, Schritte min. 1.
Speichern: encrypt(cryptoKey, JSON.stringify(recipeData)) → POST /api/sync

RECIPE DETAIL PAGE (RecipeDetailPage.tsx):
- Großes Rezeptfoto oben (mit Placeholder-Illustration)
- Titel, Quelle, Bewertung (klickbar), Dietary Tags
- NutritionDisplay.tsx
- Zutaten mit Portionsskalierung (Slider oder +/- Buttons für Portionen)
- UnitConverterWidget.tsx bei Tap auf Zutatenmenge
- Schritte-Übersicht
- Buttons: "Kochen starten", "Bearbeiten", "Zum Wochenplan hinzufügen", "Löschen"

RECIPES PAGE (RecipesPage.tsx):
- Responsive Grid: 1 Spalte mobil, 2 Tablet, 3 Desktop
- RecipeCard mit Foto, Titel, Tags, Sterne, Kochzeit, Kalorien
- Suchleiste (Debounce 300ms, sucht in Titel und Zutaten-Namen im Klartext)
- Filter: Dietary Tags, Kochzeit, Bewertung (≥ X Sterne), sortierbar nach Bewertung/Datum/Kochzeit
- Speed-Dial FAB: "Manuell erstellen", "URL importieren", "Foto scannen"
```

---

### PROMPT 7: Wochenplan, Vorrat & Einkaufsliste

```
Erstelle die Screens und Hooks für Wochenplan, Vorrat und Einkaufsliste.

useRecipes.ts:
- TanStack Query für Rezept-Liste (staleTime 5min)
- Mutation addRecipe/updateRecipe/deleteRecipe (verschlüsselt, lokal + sync)
- scaledIngredients(recipe, servings): skaliert alle Mengen proportional, nutzt unitConverter für sinnvolle Einheitenformatierung

useMealPlan.ts:
- Wochenplan-State (Mo-So)
- addToMealPlan löst automatisch useInventory.calculateShoppingNeeds() aus

useInventory.ts:
- calculateShoppingNeeds(mealPlan): { ingredient, needed, inStock, toBuy }
- applyConsumption(recipeId, consumed[]): zieht Zutaten vom Vorrat ab
- addToStock(items[]): beim Abhaken auf Einkaufsliste

useShoppingList.ts:
- checkItem(id): is_checked=true + addToStock()
- Kategorie-Mapping: ordnet Zutaten automatisch Supermarkt-Kategorien zu

MEAL PLAN PAGE:
- Kalender-View Mo-So, Karten für je Frühstück/Mittag/Abend optional
- Tap auf Slot → Rezept auswählen aus Liste, Portionen eintragen
- Zeigt Gesamtkalorien der Woche (Summe aus Nährwerten × Portionen)

INVENTORY PAGE:
- Liste aller Vorrats-Einträge mit Menge, Einheit, Name
- In-Place-Editing per Tap
- Suchfeld, manuell Eintrag hinzufügen/löschen

SHOPPING PAGE:
- Gruppiert nach Kategorien: Gemüse & Obst, Milchprodukte, Fleisch & Fisch, Tiefkühl, Backwaren, Getränke, Sonstiges
- Durchstreich-Animation beim Abhaken (CSS transition 300ms)
- Abgehakte Items grayed-out am Ende der Kategorie sichtbar bis Reset
- Footer: "X von Y Artikeln erledigt" + "Liste leeren"-Button
```

---

### PROMPT 8: Kochmodus + Echtzeit-Sync + PWA-Feinschliff

```
Erstelle den Kochmodus, die WebSocket-Sync-Logik und alle PWA-UX-Details.

COOKING PAGE (CookingPage.tsx):
Layout Desktop: Links 25% vertikale Timeline (nummerierte Kreise + Linien, aktiver Schritt Amber), Rechts 75% Schritt-Inhalt.
Layout Mobil: Horizontaler Fortschrittsindikator oben, Schritt-Inhalt darunter, Navigations-Buttons unten.

Schritt-Inhalt zeigt:
- Schritt-Beschreibung (große Schrift)
- Relevante Zutaten für diesen Schritt (aus Rezept-Daten gefiltert)
- Timer-Widget oben rechts wenn timerMinutes gesetzt:
  - Countdown MM:SS, Play/Pause, Reset
  - navigator.vibrate([200, 100, 200]) bei Ablauf
  - Läuft im Hintergrund via Web Worker (postMessage)
  - Visueller Alarm: Pulsierender Amber-Ring

WakeLock:
- navigator.wakeLock.request('screen') beim Öffnen
- Catch: persistenter blauer Info-Banner "Bildschirm-Wachbleiben nicht verfügbar (iOS). Tipp: Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie."
- wakeLock.release() beim Verlassen der Page

IngredientConsumptionDialog.tsx:
- Öffnet sich beim Klick auf "Fertig gekocht"
- Alle Rezept-Zutaten als Checkbox-Liste (Standard: alle ausgewählt)
- Basis-Zutaten (Salz, Pfeffer, Öl, Wasser, Zucker) automatisch deaktiviert
- "Bestätigen" → useInventory.applyConsumption()

useSync.ts (WebSocket):
- Verbindung zu /ws/sync beim App-Start, reconnect mit exponential backoff (1s, 2s, 4s, max 30s)
- Empfang { entity_type, id } → entsprechende TanStack Query invalidieren
- Senden bei jeder Mutation: { entity_type, id, user_id }
- Offline-Queue: fehlgeschlagene Mutationen in IndexedDB (sync_status='pending')
  → beim Reconnect alle pending senden

Konflikt-Dialog (HTTP 409 vom Server):
- Modal: "Deine Änderung" vs. "Neuere Version vom anderen Gerät"
- Buttons: "Meine Version behalten" | "Andere Version übernehmen"

PWA FEINSCHLIFF:
- Service Worker Update-Banner: Snackbar "Update verfügbar – Jetzt neu laden" mit Button
- Offline-Indikator: farbiger Punkt in der Nav-Bar (grün = online, orange = offline)
- Alle Fetch-Fehler zeigen spezifische Meldungen:
  - Netzwerkfehler: "Kein Server – Änderung wird synchronisiert wenn du wieder online bist"
  - 401: "Session abgelaufen – bitte QR-Code erneut scannen"
  - 422: "Rezept konnte nicht erkannt werden – bitte Foto erneut aufnehmen"
- Haptisches Feedback: navigator.vibrate(50) bei jedem Abhaken auf der Einkaufsliste
```

---

## X. DEPLOYMENT-CHECKLISTE (Einmalig)

```bash
# 1. Repository klonen und .env anlegen
cp .env.example .env
nano .env
# Befüllen: POSTGRES_PASSWORD, JWT_SECRET (random 64 chars), OPENROUTER_API_KEY, SERVER_URL

# 2. Frontend bauen
cd frontend && npm install && npm run build
# Output → frontend/dist/ (von Nginx serviert)

# 3. Docker starten
cd .. && docker compose up -d --build

# 4. Ersten User anlegen + QR-Code ausgeben
docker compose exec ktor-backend bash /scripts/generate-qr.sh

# 5. QR-Code mit Gerät 1 scannen
# App zeigt Button "Zweites Gerät koppeln" → generiert Einladungs-QR → Gerät 2 scannt
```

---

## XI. BACKLOG (optionale spätere Features)

- Dark Mode (Tailwind `dark:` Klassen, OS-Präferenz via `prefers-color-scheme`)
- Zutaten-Datenbank mit Autocomplete beim Tippen (OpenFoodFacts API, kostenlos)
- Ernährungsinfos per Zutat automatisch berechnen (statt nur AI-Schätzung)
- Einkaufsliste als PDF exportieren
- Rezeptbuch-Export (alle Rezepte als druckbares PDF)
- Mehrsprachigkeit (i18n, deutsch/englisch)

---

*Blueprint Version 2.1 – PWA Edition mit AI-Scan, Foto, Nährwerten, Bewertung, Tags, Einheiten-Konverter*
*Datum: 2026-05-27*
