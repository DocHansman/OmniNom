# PROJECT BLUEPRINT: OmniNom 🍳 (PWA Edition v2.2)
Target Platform: Progressive Web App (Android & iOS via Browser)
Hosting: Self-hosted Ubuntu Home Server (Docker Compose)
Security: End-to-End Encryption (Web Crypto API, AES-GCM-256) + Server-side encrypted backup keys for Google OAuth users
Design System: shadcn/ui + Tailwind CSS v4 (configured in index.css) – Warm Amber Palette
Stack: React 19 + Vite | Kotlin Ktor v3 Backend | PostgreSQL 16 | Nginx (static + auth_request) | Docker | OpenRouter/Gemini API

---

## I. WARUM PWA STATT NATIVE APP

| Kriterium | PWA (diese Version) | KMP Native (alt) |
|---|---|---|
| **iOS-Verteilung** | Browser → „Zum Home-Bildschirm" (kostenlos) | Apple Developer Konto (99 $/Jahr) + TestFlight |
| **Codebase** | 1x Frontend (React 19 + TypeScript) | 3x (shared KMP + Android + iOS Swift) |
| **Xcode erforderlich** | ❌ Nein | ✅ Ja |
| **Offline-Modus** | ✅ (Service Worker + Cache-First) | ✅ (SQLDelight) |
| **WakeLock (Kochmodus)** | ✅ Android/Chrome, ⚠️ iOS Safari (mit Warn-Banner) | ✅ Native WakeLock API auf beiden Plattformen |
| **Push-Notifications** | ✅ ab iOS 16.4 (nach Installation) | ✅ Nativ |

> **iOS WakeLock-Workaround:** Im Kochmodus wird auf iOS-Geräten ein Hinweis-Banner eingeblendet: *„Tipp: Automatische Bildschirmsperre unter Einstellungen → Anzeige → Nie (für die Kochsession) deaktivieren."*

---

## II. INTEGRIERTE DEV-AI RULES (WICHTIG: Bitte strikt befolgen!)

Du agierst als Senior Full-Stack-Entwickler. Da der Anwender über Terminal-Grundkenntnisse verfügt, aber kein DevOps-Experte ist, müssen folgende Regeln eingehalten werden:

1. **Vollständiges Frontend & Backend**: Generiere niemals nur den Server-Code oder Code-Schnipsel. Wenn ein Prompt das Frontend betrifft, liefere vollständige React-Komponenten, Hooks, Styles und Dateipfade.
2. **Proaktive UX-Verbesserungen**: Analysiere bei jedem Schritt das Benutzererlebnis. Implementiere selbstständig: WakeLock-Modus (Chrome/Android) mit iOS-Fallback-Banner, haptisches Feedback via Vibration API (50ms beim Einkaufen/Kochen), intelligente Fehlermeldungen bei Netzwerkabbrüchen mit Offline-Indikator.
3. **Keine halben Sachen**: Gib niemals unvollständigen Code oder Platzhalter (`// TODO`) aus. Alle Dateien müssen vollständig kopierbar sein.
4. **Infrastruktur via Terminal**: Liefere bei Server/Docker/UFW-Änderungen exakte, zeilenweise Terminal-Befehle.
5. **Vollständige Konfigurationsdateien**: `vite.config.ts`, `docker-compose.yml`, `nginx.conf`, Tailwind-Konfig – immer als kompletter, kopierbarer Block.

---

## III. ARCHITEKTUR & DATEI-STRUKTUR

```
OmniNom/
├── .env                                 # Produktive Secrets (Passwörter, API Keys, OAuth)
├── .env.example                         # Vorlage für Umgebungsvariablen
├── docker-compose.yml                   # Postgres, Ktor Backend, Nginx, Backup Cron
├── nginx.conf                           # WebSocket Proxying, Caching-Regeln, /photos auth_request
│
├── frontend/                            # React 19 + Vite PWA
│   ├── package.json                     # Name: "omninom-frontend", private: true
│   ├── tsconfig.json
│   ├── vite.config.ts                   # PWA Manifest, Workbox-Caching (Photos + Api)
│   ├── public/
│   │   └── favicon.svg                  # Maskable Vector App Icon
│   └── src/
│       ├── App.tsx                      # Router, AuthProvider Context, Sidebar/BottomNav
│       ├── main.tsx                     # React Mount + Service Worker Registrierung
│       ├── index.css                    # Tailwind CSS v4 Imports & Design Tokens (Amber Palette)
│       ├── api/
│       │   └── apiClient.ts             # Fetch-Wrapper: access_token, automatic token refresh, endpoints
│       ├── crypto/
│       │   └── cryptoEngine.ts          # Web Crypto API: HKDF-SHA256, AES-GCM-256 (Local Keys)
│       ├── db/
│       │   └── localDb.ts               # IndexedDB Schema (recipes, mealPlan, inventory, shoppingList, syncQueue)
│       ├── hooks/
│       │   ├── useRecipes.ts            # Rezept CRUD, Offline-First, AI-Methoden
│       │   ├── useMealPlan.ts           # Wochenplan CRUD
│       │   ├── useInventory.ts          # Vorrat CRUD, Verbrauch und Koch-Feedback
│       │   ├── useShoppingList.ts       # Kategorisierungs-Logik, Auto-Zusammenstellung
│       │   └── useSync.ts               # WebSocket Synchronisation & Konflikthandling (409)
│       ├── utils/
│       │   ├── unitConverter.ts         # Umrechnung: g, kg, ml, l, TL, EL, Tasse, Stück, Prise
│       │   ├── depletedTracker.ts       # Zwischenspeicher für aufgebrauchte Zutaten
│       │   ├── categorizer.ts           # Zuweisung von Supermarkt-Abteilungen
│       │   └── frequentIngredients.ts   # Häufig genutzte Zutatenliste
│       ├── components/
│       │   ├── RecipeCard.tsx           # Foto, Rating-Stars, Tags, Zeit, Kalorien
│       │   ├── RecipeEditor.tsx         # Zutaten-/Schritte-Reorder, AI-Generierung, Enriching
│       │   ├── PhotoCapture.tsx         # Kamera/Galerie Upload + Vorschau
│       │   ├── AiScanOverlay.tsx        # Pulsierendes Vision-Ladeoverlay
│       │   ├── StarRating.tsx           # Klickbares 5-Sterne Rating
│       │   ├── NutritionDisplay.tsx     # Protein, Fett, Carbs, Kcal Diagramm
│       │   ├── UnitConverterWidget.tsx  # Inline-Konverter Popover
│       │   ├── DietaryTagPicker.tsx     # Toggle Chips für Ernährungs-Tags
│       │   ├── InstallPrompt.tsx        # PWA Installationshinweis (Safari vs Android)
│       │   ├── ConflictResolutionModal.tsx # Dialog bei Bearbeitungskonflikten (HTTP 409)
│       │   └── Loader.tsx               # Animierter Lade-Spinner
│       └── pages/
│           ├── OnboardingPage.tsx       # QR-Scanner / Google OAuth 2.0 Integration
│           ├── RecipesPage.tsx          # Rezept-Filter & Grid
│           ├── RecipeDetailPage.tsx     # Zutaten-Skalierung, Bearbeiten, Kochen-Trigger
│           ├── MealPlanPage.tsx         # Wochenplaner & KI-Wochenplaner
│           ├── InventoryPage.tsx        # Vorratsliste & AI Rezept-Vorschläge
│           ├── ShoppingPage.tsx         # Kategorisiertes Einkaufen mit Haptik
│           ├── CookingPage.tsx          # Kochmodus, parallele Timer, Verbrauch
│           └── SettingsPage.tsx         # Systemweite KI-Modell & API-Key Verwaltung (Admin-only)
│
└── ktorBackend/                         # Kotlin Ktor v3 Backend
    ├── Dockerfile                       # Multi-stage Docker-Build (gradle buildFatJar)
    ├── build.gradle.kts                 # group = "com.omninom", mainClass = "com.omninom.ApplicationKt"
    ├── settings.gradle.kts              # rootProject.name = "ktorBackend"
    ├── gradle.properties
    ├── scripts/
    │   ├── backup.sh                    # pg_dump Backup + 7 Tage Rotation
    │   ├── generate-qr.sh               # CLI User-Seeder (generiert ASCII QR)
    │   └── verify-backend.sh            # Integrations-Testsuite für Backend & Sync
    └── src/main/kotlin/com/omninom/
        ├── Application.kt               # Netty Config, CORS, Auth JWT & WebSockets
        ├── models/
        │   └── Database.kt              # Exposed Schema: Users, Recipes, MealPlans, Inventories...
        ├── routes/
        │   ├── AuthRoutes.kt            # Challenge, QR-Login, Google-OAuth, Invite
        │   ├── SyncRoutes.kt            # Synchronisation & Konflikterkennung
        │   ├── ScraperRoutes.kt         # Schema.org Rezept-Scraper mit SSRF-Filter
        │   ├── AiRoutes.kt              # Vision Scan, AI-Bilder, Rezept-Enrichment, Suggestions
        │   ├── PhotoRoutes.kt           # Rezeptbild Uploads
        │   ├── SettingsRoutes.kt        # KI Settings (Admin) mit API-Verschleierung
        │   └── WebSocketRoutes.kt       # Sync Notification Broader
        └── utils/
            ├── GenerateUser.kt          # CLI-User-Ersteller (JCE-HKDF Ableitung)
            ├── JwtConfig.kt             # JWT token utility
            ├── MasterKeyEncryption.kt   # AES-GCM Verschlüsselung für DB-Werte (API-Keys)
```

---

## IV. FEATURE-FLOW & LOGIK

### 1. Ende-zu-Ende-Verschlüsselung (E2EE) & Google OAuth
*   **Reiner QR-Code-Flow**:
    *   Gerät 1 scannt den QR-Code des Servers. Dieser enthält den 32-Byte Master Key (`m`).
    *   Der Browser leitet zwei Schlüssel mittels `HKDF-SHA256` ab:
        1.  `Auth Key` (Salt: `"auth_v1"`, Info: `"OmniNom Auth"`) -> gehasht via `SHA-256` zu `authKeyHashHex` (wird an Server zum Login geschickt).
        2.  `Data Key` (Salt: `"data_v1"`, Info: `"OmniNom Data"`) -> bleibt im `sessionStorage` und wird zur lokalen Ver-/Entschlüsselung (AES-GCM-256) der Daten verwendet.
*   **Google OAuth 2.0 Flow**:
    *   Für Benutzer, die sich über Google anmelden, generiert das Backend bei der Erstanmeldung einen zufälligen 32-Byte Master Key.
    *   Dieser Master Key wird auf dem Server mit `AES/GCM/NoPadding` verschlüsselt. Der Schlüssel dafür wird von der Server-Variable `JWT_SECRET` abgeleitet.
    *   Der verschlüsselte Master Key wird in der Tabelle `users` in der Spalte `encrypted_master_key` abgelegt.
    *   Bei jedem Google-Login entschlüsselt das Backend den Key und gibt ihn sicher an den Client zurück (`master_key_hex`). Der Browser verarbeitet ihn danach identisch zum QR-Flow. Dies ermöglicht Multi-Gerät-Synchronisation ohne manuellen Key-Transfer.

### 2. Synchronisation & Konfliktlösung (Offline-First)
*   **Echtzeit-Synchronisation**: 
    *   Bei jeder lokalen Änderung (Rezept speichern, Wochenplan ändern etc.) wird die Mutation lokal in der IndexedDB gespeichert und in die Tabelle `syncQueue` eingereiht.
    *   Gleichzeitig wird ein `POST /api/sync` mit den neuen Datensätzen gesendet und per WebSocket eine Push-Meldung `{ "entity_type": "recipe", "id": "uuid" }` an alle anderen Sitzungen des Benutzers gesendet, um diese zum sofortigen Refresh zu zwingen.
*   **Konfliktbehandlung (HTTP 409)**:
    *   Sollte ein Client versuchen, Daten zu synchronisieren, die auf dem Server einen neueren `updated_at` Zeitstempel haben als die Version des Clients, verweigert der Server den Schreibzugriff mit **HTTP 409 Conflict**.
    *   Das Frontend zeigt das `ConflictResolutionModal` an. Der Benutzer kann entscheiden, ob er seine lokale Änderung überschreiben will ("Andere Version übernehmen") oder die Serverversion überschreiben will ("Meine Version behalten").

### 3. KI-Funktionen (Vision & Text)
*   **AI Foto-Scan (Kochbuch einlesen)**:
    *   Das Foto wird per Canvas API komprimiert und per `POST /api/recipe/from-photo` hochgeladen.
    *   Das Ktor-Backend sendet das Bild an OpenRouter (Standard: `google/gemini-2.5-flash` für Vision).
    *   Das Modell gibt ein strukturiertes JSON zurück, welches Zutaten, Portionen, Kochzeit, Tags, Schritte und geschätzte Nährwerte enthält.
    *   Der Benutzer prüft und editiert die Daten im `RecipeEditor.tsx`, bevor verschlüsselt gespeichert wird.
*   **AI Bildgenerierung (Flux)**:
    *   Über `POST /api/recipe/generate-image` wird auf OpenRouter ein Aufruf an `black-forest-labs/flux-schnell` (oder `flux.2-flex`) gestartet.
    *   Die KI generiert basierend auf dem Rezepttitel und den Zutaten ein fotorealistisches Gericht-Bild, das als `/photos/filename.jpg` auf dem Server gespeichert und mit dem Rezept verknüpft wird.
*   **AI Rezept-Enrichment**:
    *   Fehlende Portionsgrößen, Nährwerte, Tags oder Zubereitungszeiten werden via `POST /api/recipe/enrich` durch Gemini 2.5 Flash anhand des Titels und der Zutatenliste geschätzt.
*   **AI Rezept-Planer & Vorschläge (Bestandsbasiert)**:
    *   Der Vorrat (deverschlüsselte Zutaten) wird an `POST /api/recipe/suggest` gesendet.
    *   Die KI schlägt passende Rezepte vor, die sich aus dem aktuellen Vorrat kochen lassen. Ist "Ich gehe noch einkaufen" aktiviert, werden fehlende Zutaten mit `isMissing: true` markiert, um sie direkt auf die Einkaufsliste zu setzen.

### 4. Admin Einstellungen
*   In der `SettingsPage.tsx` (sichtbar nur für Benutzer, deren E-Mail in der `.env` unter `ADMIN_EMAILS` steht) lassen sich API-Keys und die genutzten KI-Modelle konfigurieren.
*   API-Keys werden in der Datenbank verschlüsselt gespeichert. Bei `GET`-Anfragen maskiert das Backend die Schlüssel (z. B. `••••••••abcd`).

---

## V. DATENBANK-SCHEMA (Exposed ORM)

```kotlin
object Users : Table("users") {
    val id = uuid("id")
    val authKeyHash = varchar("auth_key_hash", 64)
    val createdAt = datetime("created_at").default(LocalDateTime.now())
    val googleId = varchar("google_id", 255).nullable()
    val email = varchar("email", 255).nullable()
    val encryptedMasterKey = text("encrypted_master_key").nullable()
    override val primaryKey = PrimaryKey(id)
}

object Recipes : Table("recipes") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload") // Enthält: Titel, Zutaten, Schritte, Nutrition, Quelle
    val photoPath = varchar("photo_path", 512).nullable()
    val dietaryTags = varchar("dietary_tags", 1024).default("") // Komma-separiert für Filter
    val rating = integer("rating").nullable()
    val updatedAt = datetime("updated_at")
    val isDeleted = bool("is_deleted").default(false)
    override val primaryKey = PrimaryKey(id)
}

object MealPlans : Table("meal_plan") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val recipeId = uuid("recipe_id").references(Recipes.id).nullable()
    val weekDate = date("week_date")
    val servings = integer("servings").default(2)
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object Inventories : Table("inventory") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload")
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object ShoppingLists : Table("shopping_list") {
    val id = uuid("id")
    val userId = uuid("user_id").references(Users.id)
    val encryptedPayload = text("encrypted_payload")
    val isChecked = bool("is_checked").default(false)
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object InviteTokens : Table("invite_tokens") {
    val id = uuid("id")
    val token = uuid("token")
    val userId = uuid("user_id").references(Users.id)
    val expiresAt = datetime("expires_at")
    override val primaryKey = PrimaryKey(id)
}

object AiSettings : Table("ai_settings") {
    val id = varchar("id", 36).default("global")
    val encryptedPayload = text("encrypted_payload") // API Keys & Model IDs (verschlüsselt)
    val updatedAt = datetime("updated_at")
    override val primaryKey = PrimaryKey(id)
}
```

---

## VI. DESIGN-SYSTEM & STYLING (Tailwind CSS v4)

Es wird **keine** `tailwind.config.js` verwendet! Die Konfiguration erfolgt komplett über CSS-Variablen in `frontend/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-background: #FBF7F0;
  --color-surface: #FBF7F0;
  --color-on-surface: #3D2B1A;
  --color-on-surface-muted: #8B7355;
  --color-border: #E8DFD3;
  --color-primary: #C17C3A;
  --color-primary-hover: #A36428;
  --color-primary-light: #F2E6D5;
  --color-success: #2E7D32;
  --color-error: #C62828;
  --color-muted: #F2EBE1;
}
```

---

## VII. SCHRITT-FÜR-SCHRITT CODELIEFERUNG (Vibe-Coding-Prompts)

### PROMPT 1: Ktor-Backend & Docker-Compose Setup
```text
Erstelle das komplette Ktor-Backend (Kotlin) und die Docker-Infrastruktur für OmniNom. 
Das Backend läuft unter Ktor v3 mit Netty Engine und JDK 21. 
Es enthält die Exposed-ORM Tabellen Users, Recipes, MealPlans, Inventories, ShoppingLists, InviteTokens und AiSettings.
Implementiere den JSON-LD Import Scraper (ScraperRoutes.kt) mit integriertem SSRF-Schutz (blockiere lokale/private IP-Adressen wie 127.0.0.1, 10.x.x.x, 192.168.x.x).
Erstelle die docker-compose.yml mit PostgreSQL 16 (Volume postgres_data), Ktor (Port 8080), Nginx (Volume nginx.conf + static frontend mount) und einem backup-cron Container (führt täglich ein pg_dump Backup mit 7 Tage Rotation aus).
Nginx schützt den Pfad /photos/ über eine auth_request API-Validierung zu Ktor (/api/photos/verify).
Liefere alle Skripte unter ktorBackend/scripts/ (backup.sh, generate-qr.sh und verify-backend.sh).
```

### PROMPT 2: E2EE Krypto-Modul, localDb und App.tsx
```text
Erstelle das clientseitige Sicherheitsgerüst in React 19.
1. `src/crypto/cryptoEngine.ts`: Nutze ausschließlich die Web Crypto API. Implementiere `deriveKeys` mit HKDF-SHA256 für `Auth Key` (Salt: "auth_v1", Info: "OmniNom Auth") und `Data Key` (Salt: "data_v1", Info: "OmniNom Data"). Implementiere AES-GCM-256 Ver- und Entschlüsselungsfunktionen.
2. `src/db/localDb.ts`: Definiere die IndexedDB stores via "idb" wrapper (recipes, mealPlan, inventory, shoppingList, syncQueue). Der cryptoKey verbleibt im sessionStorage, niemals in IndexedDB.
3. `src/App.tsx`: Erstelle das Layout mit Desktop-Sidebar (240px) und Mobile-Bottom-Nav. Implementiere den AuthProvider, der Session-Restore beim Laden und automatische Token-Aktualisierung (Token-Refresh-Challenge bei 401) steuert.
```

### PROMPT 3: Google OAuth 2.0 & E2EE Co-Existenz
```text
Implementiere die Google Login Anbindung in Ktor (AuthRoutes.kt) und React.
1. Im Backend: POST /auth/google/callback nimmt das Google ID Token entgegen, validiert es gegen Google Cloud APIs und überprüft, ob die E-Mail in GOOGLE_ALLOWED_EMAILS existiert. 
   - Falls neu: Generiere einen 32-Byte Master Key, verschlüssele ihn per AES-GCM mit dem aus JWT_SECRET abgeleiteten Server-Key und speichere ihn in der PostgreSQL DB.
   - Falls registriert: Entschlüssele den Master Key aus der DB und liefere ihn im JSON an das Frontend zurück. Liefere zusätzlich das JWT access_token.
2. Im Frontend (OnboardingPage.tsx): Integriere GoogleLogin von "@react-oauth/google". Nach dem Erfolg leitet der Client mit dem zurückgelieferten master_key_hex lokal die Schlüssel ab und loggt sich ein.
```

### PROMPT 4: AI Vision Scan, Bildgenerierung und Vorratsplaner
```text
Erstelle die AI-Funktionen in ktorBackend/src/main/kotlin/com/omninom/routes/AiRoutes.kt und das Frontend.
1. Rezept-Scan: POST /api/recipe/from-photo nimmt ein Rezeptfoto entgegen, sendet es an OpenRouter (google/gemini-2.5-flash) und gibt das geparste JSON-Rezeptschema zurück.
2. Rezeptbild-Flux: POST /api/recipe/generate-image ruft OpenRouter (black-forest-labs/flux-schnell) auf, lädt das generierte Bild auf den Server in /data/photos/ herunter und speichert den Dateipfad.
3. Rezept-Planer: POST /api/recipe/suggest vergleicht deverschlüsselte Zutaten des Vorrats und schlägt Rezepte vor.
4. Settings: GET/POST /api/settings/ai verwaltet verschlüsselte API-Keys und Modell-IDs für Admins (ADMIN_EMAILS). Biete einen Verbindungstest (/api/settings/ai/test-connection).
```

---

## VIII. DEPLOYMENT & VERIFIKATION

### Docker-Dienste starten
```bash
cd /opt/OmniNom
docker compose up -d --build
```

### QR-Code für den ersten User ausgeben
```bash
docker exec -it omninom_backend java -jar /app/ktorBackend.jar generate-qr
```

### Backend-Verifikation ausführen (im Container oder lokal)
```bash
bash ktorBackend/scripts/verify-backend.sh
```
