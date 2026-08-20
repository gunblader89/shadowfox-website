# data/

**Diese Dateien nicht von Hand bearbeiten.**

Alles hier wird von `scripts/update.mjs` erzeugt und von der GitHub Action
automatisch aktualisiert. Was ihr selbst pflegt, liegt in `../content/`.

| Datei | Quelle | Inhalt |
|---|---|---|
| `guild.json` | Raider.IO | Progress, Rankings, Mitglieder, Klassenverteilung |
| `roster.json` | Raider.IO | Item Level und M+ Score je Kadermitglied |
| `events.json` | Raid-Helper | Termine mit allen Anmeldungen |
| `logs.json` | Warcraft Logs | Reports der letzten Raidabende |
| `wowaudit.json` | WoWAudit | Roster-Status, Anwesenheit, Wishlists |
| `blizzard.json` | Blizzard | Echte Gildenränge, M+-Runs der Woche |
| `status.json` | — | Wann zuletzt aktualisiert, welche Quellen aktiv sind |

Fehlt eine Datei, blendet die Website den zugehörigen Bereich einfach aus
oder zeigt die eingebauten Startwerte. Nichts geht kaputt.
