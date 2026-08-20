# ShadowFox — Gildenportal

Statische Website für die WoW-Raidgilde **ShadowFox** auf Blackmoore (EU).
Progress, Boss-Taktiken, Termine, Aktivitäts-Tracker, Logs, Roster und Wissensdatenbank.

**→ Einrichtung: [SETUP.md](SETUP.md)**

---

## Wie das Ganze funktioniert

Es gibt kein Framework, keinen Build und keine Datenbank. Drei Teile, mehr nicht:

```
index.html      Die Website. Eine Datei, lädt beim Aufruf ihre Inhalte.
content/        Was ihr pflegt — Taktiken, Kader, Wissen, Grunddaten.
data/           Was die APIs liefern. Wird automatisch aktualisiert.
```

Eine GitHub Action startet zweimal täglich `scripts/update.mjs`. Das Script fragt die APIs
ab, schreibt das Ergebnis nach `data/` und committet es zurück. Cloudflare Pages merkt die
Änderung und veröffentlicht sie innerhalb einer Minute.

Der Browser der Besucher spricht **nie** mit einer API. Alle Schlüssel bleiben bei GitHub.
Kein Rate-Limit-Problem, kein Geheimnis im Quelltext, keine Ladezeiten von fremden Servern.

---

## Datenquellen

| Quelle | Liefert | Schlüssel |
|---|---|---|
| **Raider.IO** | Progress, Rankings, Item Level, M+ Score, Klassenverteilung | keiner |
| **Raid-Helper** | Termine und Anmeldungen aus dem Discord | Server-Key |
| **Warcraft Logs** | Reports, Kills, Wipes, Best Try | OAuth-Client |
| **WoWAudit** | Anwesenheit, Wishlists, Roster-Status | Team-Key |
| **Blizzard** | Echte Gildenränge, M+-Runs der laufenden Woche | OAuth-Client |

**Great Vault gibt es bei keiner offiziellen API.** Blizzard bietet dafür keine Schnittstelle
— die Anfrage liegt seit 2021 unbeantwortet im Entwicklerforum. Der M+-Anteil lässt sich aus
den Wochenruns ableiten, Raid und PvP nicht. Vollständig ginge es nur über WoWAudit mit
dessen Begleit-Addon.

Jede Quelle ist einzeln abgesichert: Fehlt ein Schlüssel oder ist eine API gerade nicht
erreichbar, wird nur diese eine übersprungen. Die Seite läuft mit den zuletzt geholten Daten
weiter und zeigt oben, wie alt sie sind.

---

## Inhalte pflegen

**Mit Weboberfläche** (empfohlen, siehe SETUP.md Abschnitt E):
`https://eure-adresse/admin/` — Login mit GitHub, dann ein normaler Editor.

**Ohne Weboberfläche:** die Dateien in `content/` direkt auf GitHub bearbeiten.

| Datei | Inhalt |
|---|---|
| `content/site.json` | Gildenname, Raidzeiten, Motto, gesuchte Klassen, externe Links |
| `content/bosses.json` | Boss-Taktiken mit Ansagen nach Rolle |
| `content/raider.json` | Raid-Kader mit Rollen und Vorstellungstexten |
| `content/wissen.json` | Regeln, Loot, Addons, Onboarding |
| `content/termine.json` | Termine, falls ihr Raid-Helper nicht anbindet |
| `content/integrationen.json` | Die Technik-Übersicht auf der Tracker-Seite |

In den Ansagen dürfen `<em>…</em>` für Fähigkeitennamen und `<b>…</b>` stehen — sonst
bleibt alles Text.

**`data/` niemals von Hand bearbeiten.** Wird beim nächsten Lauf überschrieben.

---

## Neuer Tier, neuer Raid

1. In `content/site.json` unter `raid` den neuen Namen eintragen
2. `rioKey` auf das Kürzel setzen, das Raider.IO benutzt — steht in `data/guild.json`
   unter `raidProgression`, sobald die Action einmal gelaufen ist.
   Den alten Wert nach `rioKeyPrev` verschieben.
3. In `content/bosses.json` die neuen Bosse anlegen. `slug` ist das Wowhead-Kürzel,
   daraus wird der Link zum Guide gebaut.

---

## Lokal ausprobieren

```bash
python3 -m http.server 8080      # dann http://localhost:8080 öffnen
```

Datenabgleich testen — `.env.example` nach `.env` kopieren, Werte eintragen, dann:

```bash
node scripts/update.mjs
```

Braucht Node 20 oder neuer. Keine Abhängigkeiten, kein `npm install`.
`.env` steht in `.gitignore` und wird nie hochgeladen.

---

## Woher die Zahlen im Prototyp stammen

Echt und geprüft: Gildenname, Realm, Fraktion, Progress, Rankings, Mitgliederzahl,
Klassenverteilung, Spielernamen und Gildenränge (alles Raider.IO, Stand 20.08.2026),
Raidzeiten und gesuchte Klassen (WoWProgress), sowie die Boss-Mechaniken
(Wowhead DE, Icy Veins, Method).

Geraten und zu korrigieren: die **Rollenzuordnung** im Kader (wer Tank, wer Heal) und
die Frage, wer überhaupt zum Kader gehört — Gildenrang 2 sah nach einer Twink-Stufe aus.

Beispielwerte bis die APIs laufen: Anwesenheit, Wishlist-Status und die Parse-Zahlen.
Die echten M+-Scores standen am 20.08. noch auf 0, weil Season 2 gerade erst gestartet war.

---

## Lizenz

Privat für ShadowFox. Boss-Mechaniken sinngemäß nach Wowhead und Icy Veins.
