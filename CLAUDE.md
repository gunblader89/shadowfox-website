# ShadowFox-Gildenwebsite — Kontext für Claude

Diese Datei ist für jede Claude-Sitzung gedacht, die an diesem Projekt weiterarbeitet.
Sie fasst zusammen, was gebaut wurde, was noch offen ist und worauf zu achten ist.

**Sprache: Deutsch.** Der Nutzer (Alex) schreibt deutsch, alle Inhalte der Website sind
deutsch, Code-Kommentare ebenfalls. Bitte beibehalten.

---

## Was das ist

Statische Website für die WoW-Raidgilde **ShadowFox** auf Blackmoore (EU), Allianz.
Zweck: Taktiken, Termine, Logs und Spieler-Aktivität an einem auffindbaren Ort bündeln,
statt sie im Discord versinken zu lassen. Der ausdrückliche Schmerzpunkt des Nutzers war
**„Infos wiederfinden"** — deshalb ist die globale Suche (Strg+K) das Kernfeature und
sollte bei Änderungen nie kaputtgehen.

## Architektur — bewusst minimal

Kein Framework, kein Build, keine Datenbank, keine npm-Abhängigkeiten.

```
index.html    Die komplette Website. Eine Datei, ca. 90 KB.
              Alle Views sind Funktionen in einem `views`-Objekt, Routing per Hash.
              Beim Start lädt `boot()` alle JSON-Dateien und mappt sie auf die
              eingebauten Datenstrukturen (G, BOSSES, KADER, KB, TERMINE, REPORTS,
              EVENT, INTEGR, CLASSES).
content/      Von Menschen gepflegt, über Sveltia CMS unter /admin.
data/         Von scripts/update.mjs erzeugt. NIEMALS von Hand bearbeiten.
scripts/      Node, keine Abhängigkeiten, nutzt globales fetch (Node >= 20).
```

**Wichtig:** Die hartcodierten Werte in `index.html` sind Fallback. Lädt eine JSON-Datei
nicht, greifen sie. Die Seite muss immer funktionieren, auch ohne `data/`.
Beim Ändern von Datenstrukturen daher **beide** Stellen anpassen: den Fallback in
`index.html` und das Mapping in `applyContent()` / `applyData()`.

## Datenquellen

| Quelle | Schlüssel | Liefert |
|---|---|---|
| Raider.IO | keiner | Progress, Rankings, ilvl, M+ Score, Klassenverteilung |
| Raid-Helper | Server-Key | Termine und Signups aus dem Discord |
| Warcraft Logs | OAuth-Client | Reports, Kills, Wipes, Best Try |
| WoWAudit | Team-Key | Anwesenheit, Wishlists |
| Blizzard | OAuth-Client | Gildenränge, M+-Runs der Woche |

Verifizierte Eigenheiten, die schon Zeit gekostet haben:

- **Raider.IO:** Der `fields`-Parameter darf **nicht** URL-kodiert werden. Kodiert liefert
  die API stillschweigend nur das Basisprofil, ohne Fehler.
- **Raid-Helper:** `GET /api/event/{id}` funktioniert **ohne** Key. Nur die Event-Liste
  `/api/v3/servers/{id}/events` braucht einen.
- **Warcraft Logs:** Punktebudget statt Request-Zähler, 3.600 Punkte/Stunde.
  Deshalb nur im Cron-Job abfragen, nie pro Besucher.
- **Great Vault:** Gibt es bei keiner offiziellen API. Nur der M+-Anteil ist aus
  `mythic-keystone-profile` ableitbar. Nicht versuchen, das anders zu lösen.

Jede Quelle ist einzeln abgesichert: fehlender Key oder API-Ausfall überspringt nur diese
eine Quelle. Leere Antworten dürfen bestehende Daten **nicht** überschreiben — der Schutz
in `update.mjs` bei `roster.json` ist Absicht, bitte beim Erweitern mitdenken.

---

## Stand und offene Punkte

### Erledigt
- Website komplett, acht Seiten, responsive, globale Suche
- Alle Boss-Taktiken für „Der Giftige Abgrund" recherchiert und eingepflegt
- `scripts/update.mjs` für alle fünf Quellen geschrieben
- GitHub Action mit Cron und Commit-Back
- Sveltia CMS konfiguriert
- SETUP.md geschrieben

### Aktueller Stand (20.08.2026, abends)
- **Website ist live:** https://shadowfox-website.pages.dev
  Cloudflare **Pages**, verbunden mit `gunblader89/shadowfox-website`, Branch `main`.
  Jeder Commit deployt automatisch, kein Build-Schritt.
- Der erste Versuch war versehentlich ein Worker aus der Hello-World-Vorlage und wurde
  verworfen. Falls das Thema wiederkommt: `docs/wrangler-fuer-workers.jsonc`.
- **`.github/workflows/update-data.yml` wurde nachträglich von Hand über die
  GitHub-Weboberfläche angelegt.** Grund: Beim Upload des ZIP hat Windows den
  Punkt-Ordner `.github` ausgeblendet, er fehlte im Repo. Aus demselben Grund fehlen
  weiterhin `.gitignore` und `.env.example` — unkritisch.
  **Lehre für künftige Uploads: Punkt-Dateien einzeln über die Weboberfläche anlegen.**
- Die Action läuft. Warnung wegen Node 20 bei `actions/checkout@v4` /
  `actions/setup-node@v4` — durch `@v5` ersetzen, dann ist sie weg.

### Als Nächstes dran
- **Noch kein einziges GitHub-Secret gesetzt.** Nur Raider.IO liefert Daten
  (braucht keinen Schlüssel). Reihenfolge nach Nutzen: Warcraft Logs → Raid-Helper →
  Blizzard → WoWAudit.
- **WoWAudit:** Team existiert („ShadowFox / Mytic"), aber auf wowaudit.com/api steht
  „No API key has been configured for this team". Der Schlüssel muss erst in den
  Team-Settings erzeugt werden; möglicherweise hängt das an einem Bezahltarif.
  Nicht verifiziert. Notfalls verzichtbar — Attendance kann auch Raid-Helper liefern.
- **`CLAUDE.md` und `docs/` fehlen eventuell im Repo**, je nachdem welches ZIP
  hochgeladen wurde. Bei Bedarf nachreichen.

### Vom Nutzer zu korrigieren — NICHT selbst erfinden
- **Rollenzuordnung im Kader** (`content/raider.json`, Feld `rolle`): wer Tank, Heal,
  Melee, Ranged ist, wurde geraten.
- **Wer überhaupt zum Kader gehört:** abgeleitet aus Gildenrang 0,1,3,4,5.
  Rang 2 wurde ausgeschlossen, weil er nach einer Twink-Stufe aussah
  (sechs „Merc…"-Charaktere eines Spielers).
- **Alle Wissens-Artikel** sind leere Vorlagen (`vorlage: true`).
- **Vorstellungstexte** der Spieler sind leer.

---

## Was echt ist und was nicht

Wichtig für Ehrlichkeit gegenüber dem Nutzer — nichts davon als gesichert ausgeben,
was hier als geraten markiert ist.

**Echt, verifiziert (Raider.IO-API, WoWProgress, Stand 20.08.2026):**
Gildenname, Realm, Fraktion, Progress 5/8 Normal, Season 1 mit 5/9 Mythisch,
Rankings, 139 Mitglieder, Klassenverteilung, alle Spielernamen und Gildenränge,
Raidzeiten Mo und Do 19:45–22:30, gesuchte Klassen (Dämonenjäger, Todesritter, Rufer).

**Echt, recherchiert (Wowhead DE, Icy Veins, Method, goldgoblin.net):**
Alle Boss-Mechaniken. Ausnahme: **Ula'tek** — Icy Veins hatte am 20.08. noch keinen
fertigen Guide, die Punkte stammen aus Wowhead und sind teils vorläufig.
Das Warnfeld beim Boss ist bewusst gesetzt und sollte bleiben, bis eigene Pulls da sind.

**Beispielwerte, bis die APIs laufen:**
Anwesenheit, Wishlist-Status, Parse-Zahlen, M+-Scores.
Die echten M+-Scores standen am 20.08. auf 0, weil Season 2 erst gestartet war.
Im Code steuert `p.demo` und `LIVE.data`, ob das Badge „Beispielwerte" erscheint.

---

## Umgangsregeln

- **Keine API-Schlüssel entgegennehmen.** Der Nutzer trägt sie selbst in die
  GitHub-Secrets ein. Nicht im Chat, nicht in Dateien. Der WoWAudit-Key erlaubt
  auch Schreibzugriffe.
- **Der Nutzer ist nicht technisch.** Klickpfade wörtlich beschreiben, keine
  Fachbegriffe ohne Erklärung, keine Kommandozeile voraussetzen wo es anders geht.
- **Unsicheres kennzeichnen.** In SETUP.md sind vier Klickpfade als nicht verifiziert
  markiert (Raid-Helper-Befehl, Blizzard-Portal, WoWAudit-API-Seite,
  Cloudflare-Menüname). Lieber sagen „konnte ich nicht prüfen" als raten.
- **Testen vor dem Ausliefern.** Lokal `python3 -m http.server 8080`, dann prüfen:
  alle acht Routen rendern, die Suche findet etwas, keine JS-Fehler in der Konsole,
  Tracker-Tabelle sortiert.

## Lokal testen

```bash
python3 -m http.server 8080     # http://localhost:8080
cp .env.example .env            # Werte eintragen
node scripts/update.mjs         # Datenabgleich testen
```
