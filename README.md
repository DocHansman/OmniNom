# OmniNom 🍳

Eine selbst-gehostete Koch-App (PWA) für den Heimserver – mit modernster KI-Unterstützung, vollständiger Ende-zu-Ende-Verschlüsselung (E2EE) und Multi-Gerät-Echtzeit-Synchronisation.

---

## Was OmniNom kann

OmniNom ist deine private, E2EE-verschlüsselte Rezept- und Vorratsverwaltung für den Haushalt. Alle Daten liegen sicher auf deinem eigenen Server – kein Cloud-Abo, kein Datenverlust, maximale Privatsphäre.

**Kernfunktionen:**

*   **Rezeptverwaltung**: Rezepte manuell eingeben, vollautomatisch per URL von beliebten Kochseiten importieren oder eingescannte Buchseiten per Kamera einlesen.
*   **KI-Unterstützung**: 
    *   *Foto-Scan*: Erkennt und extrahiert Zutaten sowie Schritte aus Buchseiten.
    *   *AI-Bildgenerierung*: Erzeugt fotorealistische Rezeptbilder aus Zutaten (via Flux-Schnell).
    *   *Rezept-Anreicherung*: Schätzt Nährwerte, Portionen, Kochzeiten und weist passende Tags zu.
    *   *Intelligente Vorschläge*: Generiert Rezeptvorschläge basierend auf deinem aktuellen Vorrat im Kühlschrank.
*   **Wochenplanung**: Rezepte flexibel auf Wochentage verteilen mit integriertem KI-Wochenplaner.
*   **Einkaufsliste**: Wird automatisch aus dem Wochenplan und dem aktuellen Vorrat berechnet. Fehlende Artikel können mit einem Klick in den Vorrat umgebucht werden.
*   **Vorratsverwaltung**: Behalte den Überblick über Kühlschrank und Vorratskammer, inklusive KI-Scan per Kamera.
*   **Kochmodus**: Eine ablenkungsfreie Schritt-für-Schritt-Ansicht mit mehreren parallelen Timern.
*   **Multi-Gerät-Sync**: Smartphone, Tablet und PC im Haushalt synchronisieren sich in Echtzeit (via Google Login, siehe unten).
*   **Offline-First**: Dank Progressive Web App (PWA) läuft die App auch ohne aktive Internetverbindung direkt auf deinem Homescreen.

**Ende-zu-Ende-Verschlüsselung (E2EE):**
Alle Rezepte, Zutaten, Beschreibungen, Vorräte und Listen werden lokal im Browser verschlüsselt (AES-GCM-256), bevor sie an den Server übertragen werden. Der Server speichert ausschließlich unlesbare Datenpakete und hat zu keinem Zeitpunkt Zugriff auf deine Rezepte.

---

## Voraussetzungen

*   **Server**: Ubuntu-Server (Heimserver, Synology NAS, VPS, etc.) mit mind. 1 GB RAM.
*   **Docker**: Installiertes [Docker](https://docs.docker.com/engine/install/ubuntu/) und [Docker Compose](https://docs.docker.com/compose/install/).
*   **KI-Schnittstelle**: Ein [OpenRouter](https://openrouter.ai)-API-Key (kostenlos registrierbar) für modernste Sprachmodelle (z.B. Gemini, Claude, Flux).

---

## Schnellstart

### 1. Repository klonen

```bash
cd /opt
git clone https://github.com/DocHansman/OmniNom.git
cd OmniNom
```

### 2. Umgebungsvariablen einrichten

```bash
cp .env.example .env
nano .env
```

Trage mindestens folgende Werte ein:

```env
POSTGRES_PASSWORD=ein_sicheres_datenbankpasswort
JWT_SECRET=ein_64_zeichen_langer_hex_string
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3. Container starten

```bash
docker compose up -d
```

Docker startet automatisch die folgenden Dienste:
*   **omninom_postgres**: Sichere PostgreSQL 16 Datenbank
*   **omninom_backend**: Kotlin Ktor v3 Anwendungs-Server
*   **omninom_nginx**: Reverse Proxy zur Auslieferung des React-Frontends und Weiterleitung von WebSockets
*   **omninom_backup**: Automatischer Backup-Cron-Job (täglich um 03:00 Uhr)

### 4. Ersten Benutzer anlegen

Führe den CLI-Seeder im Backend-Container aus, um deinen verschlüsselten Zugangsschlüssel (E2EE Master Key) zu generieren:

```bash
docker exec -it omninom_backend java -jar /app/ktorBackend.jar generate-qr
```

Im Terminal wird ein ASCII-QR-Code ausgegeben. Scanne diesen einfach mit deinem Smartphone, um die App zu öffnen und dich automatisch einzuloggen.

### 5. App aufrufen

Öffne den Browser in deinem lokalen Netzwerk unter:
`http://SERVER-IP`

---

## Fernzugriff per Cloudflare Tunnel (optional)

Um OmniNom auch unterwegs sicher zu nutzen – ohne Portweiterleitungen oder DynDNS –, wird ein kostenloser **Cloudflare Tunnel** empfohlen. Damit ist deine App über HTTPS erreichbar, während alle Ports an deinem Router geschlossen bleiben.

### Einrichtung

1.  Kostenlosen Account auf [cloudflare.com](https://dash.cloudflare.com) anlegen.
2.  Im Dashboard zu **Zero Trust → Networks → Tunnels → Create a tunnel** navigieren.
3.  Tunneltyp **Cloudflared** wählen und Namen vergeben (z.B. `omninom`).
4.  Den angezeigten Installationsbefehl auf deinem Ubuntu-Server ausführen.
5.  Unter **Public Hostname** folgendes eintragen:
    *   **Domain / Subdomain**: z.B. `omninom.deine-domain.de`
    *   **Service**: Type: `HTTP`, URL: `localhost:80`
6.  Tunnel speichern.

Die App ist danach weltweit sicher unter `https://omninom.deine-domain.de` erreichbar.

---

## Google Login einrichten (optional, für Multi-Gerät-Sync erforderlich)

Standardmäßig meldet man sich per QR-Code-Scan an. Jedes Gerät erhält dabei standardmäßig einen eigenen Datensatz. 

Um mehrere Geräte (z.B. dein Smartphone und ein Tablet in der Küche) mit denselben verschlüsselten Rezepten und Listen zu synchronisieren, wird Google OAuth 2.0 verwendet. Dabei teilen sich alle freigegebenen E-Mail-Adressen den gleichen Datenpool.

### 1. Google Cloud Console konfigurieren

1.  Öffne die [Google Cloud Console](https://console.cloud.google.com) und erstelle ein neues Projekt namens `OmniNom`.
2.  Gehe zu **APIs & Dienste → OAuth-Zustimmungsbildschirm** → Typ „Intern" (oder „Extern" falls nötig) → App-Name `OmniNom` eingeben.
3.  Gehe zu **Anmeldedaten → OAuth-Client-ID erstellen** → Typ: *Webanwendung*.
4.  Trage die **Autorisierten JavaScript-Quellen** ein:
    ```text
    http://localhost
    https://omninom.deine-domain.de
    ```
5.  Trage die **Autorisierten Weiterleitungs-URIs** ein:
    ```text
    http://localhost/auth/google/callback
    https://omninom.deine-domain.de/auth/google/callback
    ```
6.  Kopiere die generierte **Client-ID** und das **Client-Secret**.

### 2. In der `.env` eintragen

Füge die Keys in deiner Server-`.env` hinzu:

```env
GOOGLE_CLIENT_ID=deine-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_ALLOWED_EMAILS=dein.name@gmail.com,partner.name@gmail.com
```

### 3. Frontend `.env` erstellen

Erstelle eine lokale Konfigurationsdatei für das Frontend:

```bash
echo "VITE_GOOGLE_CLIENT_ID=deine-client-id.apps.googleusercontent.com" > frontend/.env
```

Bilde danach das Frontend neu und starte den Stack neu:

```bash
cd frontend && npm run build && cd ..
docker compose up -d --build
```

---

## Updates einspielen

Um OmniNom auf den neuesten Stand zu bringen, ziehe einfach die Änderungen und baue das Frontend neu:

```bash
git pull
cd frontend && npm run build && cd ..
docker compose up -d --build
```

---

## Technischer Stack

| Komponente | Technologie |
| :--- | :--- |
| **Frontend** | React 19 + TypeScript + Vite PWA (Tailwind CSS v4) |
| **Backend** | Kotlin + Ktor v3 (Netty Engine) |
| **Datenbank** | PostgreSQL 16 (JetBrains Exposed ORM) |
| **Proxy** | Nginx |
| **Deployment** | Docker Compose |
| **E2EE Verschlüsselung** | AES-GCM-256, HKDF-SHA256 (Web Crypto API im Browser / JCE im Java-Backend) |

Eine detaillierte technische Dokumentation findest du in der [walkthrough.md](walkthrough.md).

---

## Entstehung (Vibe Code)

OmniNom wurde im Rahmen eines Experiments komplett mittels **Vibe Coding** entwickelt. Keine einzige Zeile Code wurde manuell von Hand geschrieben. 

Das Projekt entstand in der **Google Antigravity IDE** unter Verwendung von **Gemini 3.5 Flash** (sowie punktueller Unterstützung von **Claude 3.5 Sonnet** und **Claude 3.5 Opus**). Die Idee war, eine voll funktionsfähige, datenschutzfreundliche Full-Stack-Applikation ausschließlich durch Konversation mit KI-Modellen zu erschaffen – ohne tiefe Vorkenntnisse in Kotlin oder React. Das Resultat ist OmniNom!

---

## Lizenz

Dieses Projekt ist unter der **MIT-Lizenz** lizenziert.
