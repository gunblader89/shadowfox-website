# ShadowFox-Website — Einrichtung

Diese Anleitung führt dich von null bis zur laufenden Seite. Rechne mit **60 bis 90 Minuten**,
verteilt auf sechs Abschnitte. Nach Abschnitt B ist die Seite schon online — alles danach
schaltet nach und nach die Automatik frei.

Du brauchst keinerlei Programmierkenntnisse. Wo du etwas kopieren musst, steht es wörtlich da.

---

## Vorab: das Wichtigste zu den Schlüsseln

Du wirst gleich mehrere API-Schlüssel erzeugen. Dafür drei Regeln:

1. **Schick mir keinen davon.** Nicht in den Chat, nicht in eine Datei, nirgendwo. Du trägst sie
   direkt bei GitHub ein. Ich brauche sie nie und will sie nicht sehen.
2. **Sie gehören nur in die GitHub-Secrets** (Abschnitt C). Nie in eine Datei im Projekt,
   nie in die `config.yml`, nie in den Discord.
3. Wenn doch mal einer irgendwo landet, wo er nicht hingehört: bei der jeweiligen Stelle
   löschen und neu erzeugen. Das dauert zwei Minuten und ist kein Drama.

Der WoWAudit-Schlüssel erlaubt auch Schreibzugriffe auf euer Team. Mit dem besonders sorgsam sein.

---

## A — Vorbereitung (10 Minuten)

### A1. GitHub-Konto

Falls du noch keins hast: **https://github.com/signup** — kostenlos, E-Mail und Passwort genügen.

### A2. Repository anlegen

1. Auf **https://github.com/new**
2. **Repository name:** `shadowfox-website`
3. **Public** auswählen
   *Warum öffentlich? Bei öffentlichen Repos sind die GitHub-Actions-Minuten unbegrenzt kostenlos.
   Bei privaten wären es 2.000 Minuten im Monat — würde auch reichen, aber öffentlich ist
   sorgenfreier. Eure Schlüssel liegen in den Secrets und sind auch bei einem öffentlichen
   Repo für niemanden sichtbar.*
4. Haken bei „Add a README file" **weglassen**
5. **Create repository**

### A3. Dateien hochladen

1. Entpacke das ZIP, das du von mir bekommen hast
2. Auf der Repo-Seite: **uploading an existing file** anklicken
3. Alle Dateien und Ordner ins Fenster ziehen

   > **Achtung:** Der Ordner `.github` beginnt mit einem Punkt und wird von manchen
   > Dateimanagern versteckt. Unter Windows im Explorer: Reiter **Ansicht** → Haken bei
   > **Ausgeblendete Elemente**. Unter macOS im Finder: **Cmd + Shift + Punkt**.
   > Ohne diesen Ordner läuft die Automatik später nicht.

4. Unten **Commit changes**

### A4. Repo-Name in zwei Dateien eintragen

Öffne im Repo die Datei `admin/config.yml` (anklicken, dann das Stift-Symbol) und ändere Zeile 12:

```yaml
repo: DEIN-GITHUB-NAME/shadowfox-website
```

`DEIN-GITHUB-NAME` durch deinen tatsächlichen GitHub-Benutzernamen ersetzen. Dann **Commit changes**.

`base_url` in derselben Datei lassen wir vorerst stehen — die kommt in Abschnitt E dran.

---

## B — Die Seite online bringen (15 Minuten)

Danach ist die Website erreichbar. Noch ohne Automatik, aber mit allen echten Daten,
die schon im Projekt liegen.

### B1. Cloudflare-Konto

**https://dash.cloudflare.com/sign-up** — kostenlos.

### B2. Projekt anlegen

1. Direkt zu **https://dash.cloudflare.com/?to=/:account/workers-and-pages**
   *(Diese Adresse funktioniert unabhängig davon, wie der Menüpunkt in deinem Konto gerade
   heißt. Cloudflare baut das Dashboard oft um — in der Seitenleiste steht je nach Konto
   „Workers & Pages", „Workers" oder „Compute".)*
2. **Create application** → Reiter **Pages** → **Connect to Git**
3. **Install & Authorize** — GitHub verbinden, Repo `shadowfox-website` freigeben
4. Repo auswählen → **Begin setup**
5. Einstellungen:

   | Feld | Eintrag |
   |---|---|
   | Project name | `shadowfox` (bestimmt die Adresse, siehe unten) |
   | Production branch | `main` |
   | Framework preset | `None` |
   | **Build command** | **leer lassen** |
   | **Build output directory** | **leer lassen** |

   Die letzten beiden sind wichtig: Es gibt keinen Build. Falls Cloudflare das Feld
   „Build command" partout nicht leer akzeptiert, trag `exit 0` ein.

6. **Save and Deploy**

Nach ein bis zwei Minuten ist die Seite unter **`https://shadowfox.pages.dev`** erreichbar.
Der Projektname muss weltweit eindeutig sein — ist `shadowfox` vergeben, nimm etwa
`shadowfox-blackmoore`.

**Ab jetzt gilt:** Jede Änderung im GitHub-Repo geht automatisch innerhalb einer Minute live.

---

## C — Automatik einschalten (20 Minuten)

Jetzt besorgst du die Schlüssel. **Die Reihenfolge ist egal**, und du musst nicht alle auf
einmal machen — jede Quelle funktioniert für sich. Fehlt ein Schlüssel, überspringt das
Script diese eine Quelle und macht mit dem Rest weiter.

**Raider.IO brauchst du gar nicht einrichten.** Progress, Item Level und M+ laufen ohne
Anmeldung — das ist bereits aktiv.

### C1. Wo die Schlüssel hingehören

Für jeden Wert unten:

1. Im Repo auf **Settings** (oben rechts im Repo, nicht das Konto-Settings)
2. Seitenleiste, Abschnitt **Security**: **Secrets and variables** → **Actions**
3. Reiter **Secrets** → **New repository secret**
4. **Name** exakt wie in der Tabelle, **Secret** = der Wert → **Add secret**

| Name | Wofür |
|---|---|
| `RAIDHELPER_API_KEY` | Signups aus dem Discord |
| `RAIDHELPER_SERVER_ID` | eure Discord-Server-ID |
| `WCL_CLIENT_ID` | Warcraft Logs |
| `WCL_CLIENT_SECRET` | Warcraft Logs |
| `WOWAUDIT_API_KEY` | Anwesenheit, Wishlists |
| `BLIZZARD_CLIENT_ID` | Gildenränge, M+-Runs |
| `BLIZZARD_CLIENT_SECRET` | Gildenränge, M+-Runs |

### C2. Discord-Server-ID

1. Discord → Zahnrad unten links → **Erweitert** → **Entwicklermodus** einschalten
2. Rechtsklick auf euer Server-Symbol in der linken Leiste → **Server-ID kopieren**

Das ist eine lange Zahl. Als `RAIDHELPER_SERVER_ID` eintragen.

### C3. Raid-Helper-Schlüssel

Im Discord, in einem Channel, in dem der Raid-Helper-Bot ist, den Befehl **`/apikey`** eingeben.
Der Bot bietet dir die passende Unterfunktion an (vermutlich `refresh`) und schickt dir den
Schlüssel per Direktnachricht.

> **Ehrlicher Hinweis:** Den genauen Befehlsnamen konnte ich nicht verifizieren — die
> Raid-Helper-Doku lässt sich nicht automatisch auslesen. Falls `/apikey` nichts findet,
> schau kurz auf **https://raid-helper.dev/documentation/api**. Du brauchst dafür
> Administrator-Rechte auf dem Server.

Als `RAIDHELPER_API_KEY` eintragen.

### C4. Warcraft Logs

1. **https://www.warcraftlogs.com/api/clients/** (mit eurem Logs-Konto einloggen)
2. **Create Client**
3. **Name:** `ShadowFox Website`
4. **Redirect URLs:** `http://localhost`
   *(Pflichtfeld, wird bei unserem Verfahren nie benutzt.)*
5. „Public Client" **nicht** anhaken — sonst bekommst du kein Secret
6. Speichern. Client ID und Client Secret stehen danach in der Liste.

Als `WCL_CLIENT_ID` und `WCL_CLIENT_SECRET` eintragen.

### C5. Blizzard

1. **https://develop.battle.net/access/** — mit Battle.net-Konto anmelden
   *(Zwei-Faktor-Authentifizierung muss auf dem Konto aktiv sein.)*
2. **Create Client**
3. Name frei wählen, bei **Redirect URL** `https://localhost` eintragen,
   bei „Intended Use" kurz „Gilden-Website" schreiben
4. Nach dem Speichern stehen Client ID und Secret auf der Detailseite

> **Ehrlicher Hinweis:** Blizzard sperrt automatisierte Zugriffe auf sein Entwicklerportal,
> die Beschriftungen der Felder konnte ich deshalb nicht gegenprüfen. Sinngemäß passt es,
> die Bezeichnungen können leicht abweichen.

Als `BLIZZARD_CLIENT_ID` und `BLIZZARD_CLIENT_SECRET` eintragen.

### C6. WoWAudit

Nur nötig, wenn ihr WoWAudit benutzt.

1. Auf **https://wowaudit.com** einloggen, euer Team auswählen
2. In der Team-Navigation den Punkt **API** öffnen
   *(Direktadresse nach dem Muster `https://wowaudit.com/eu/blackmoore/shadowfox/DEIN-TEAM/api`)*
3. Dort steht der Team-Schlüssel

Als `WOWAUDIT_API_KEY` eintragen.

### C7. Erster Lauf

1. Im Repo auf den Reiter **Actions**
2. Links **Daten aktualisieren** anklicken
3. Rechts **Run workflow** → **Run workflow**
4. Nach etwa einer Minute den Lauf anklicken und ins Protokoll schauen

Dort steht pro Quelle eine Zeile: **✓** geladen, **○** übersprungen (kein Schlüssel),
**✕** Fehler mit Grund. Danach findest du die neuen Dateien im Ordner `data/`,
und die Website zeigt sie innerhalb einer Minute an.

Ab jetzt läuft das **zweimal täglich von selbst**: morgens um 07:20 und nachts um 01:40
deutscher Zeit — also kurz nach eurem Raidabend.

---

## D — Kader eintragen (10 Minuten)

Das ist die einzige Stelle, an der ich raten musste. Öffne `content/raider.json` im Repo
und prüfe für jeden Eintrag:

- **`name`** — muss exakt dem Charakternamen im Spiel entsprechen, sonst findet Raider.IO
  ihn nicht. Sonderzeichen wie `à` und `í` gehören dazu.
- **`rolle`** — `Tank`, `Heal`, `Melee` oder `Ranged`. **Die habe ich alle geraten.**
- **`aktiv`** — auf `false` setzen statt löschen, wenn jemand pausiert.

Bequemer geht das nach Abschnitt E über die Weboberfläche.

Wer fehlt, kommt dazu. Wer nicht im Kader ist, fliegt raus — die Klassenverteilung auf der
Roster-Seite zählt ohnehin die ganze Gilde und kommt direkt aus der API.

---

## E — Weboberfläche zum Bearbeiten (20 Minuten)

Damit können Officer Taktiken, Wissensartikel und Spielervorstellungen bearbeiten, ohne
je eine Datei anzufassen — ein Editor im Browser unter `https://eure-adresse/admin/`.

**Was du vorher wissen solltest:** Jeder Officer, der bearbeiten soll, braucht ein
kostenloses GitHub-Konto und muss von dir als Mitarbeiter am Repo eingeladen werden
(**Settings → Collaborators → Add people**). Einen Login ohne GitHub gibt es bei diesem
System nicht. Für zwei bis drei Officer ist das eine einmalige Sache von fünf Minuten pro Person.

Wir benutzen **Sveltia CMS**. Das ist aktiv gepflegt und wird breit eingesetzt, ist aber
offiziell noch in der Beta und wird im Wesentlichen von einer Person entwickelt. Für unseren
Zweck — ein paar JSON-Dateien bearbeiten — ist das unkritisch, aber du sollst es wissen.

### E1. Login-Dienst einrichten

1. **https://github.com/sveltia/sveltia-cms-auth** öffnen
2. Im README den Knopf **Deploy to Cloudflare** anklicken und dem Assistenten folgen
3. Danach steht im Cloudflare-Dashboard unter **Workers** ein neuer Eintrag.
   Notiere dir seine Adresse, etwa `https://sveltia-cms-auth.dein-name.workers.dev`

### E2. GitHub-Anmeldung erlauben

1. **https://github.com/settings/applications/new**
2. **Application name:** `ShadowFox CMS`
3. **Homepage URL:** `https://shadowfox.pages.dev`
4. **Authorization callback URL:** die Worker-Adresse von eben **mit `/callback` am Ende**,
   also z. B. `https://sveltia-cms-auth.dein-name.workers.dev/callback`
5. **Register application**
6. **Client ID** notieren, dann **Generate a new client secret** → Secret sofort notieren
   (es wird nur ein einziges Mal angezeigt)

### E3. Worker konfigurieren

Cloudflare-Dashboard → **Workers** → dein Worker → **Settings** → **Variables and Secrets**.
Drei Einträge anlegen:

| Name | Wert | Typ |
|---|---|---|
| `GITHUB_CLIENT_ID` | Client ID aus E2 | Text |
| `GITHUB_CLIENT_SECRET` | Secret aus E2 | **Secret / encrypted** |
| `ALLOWED_DOMAINS` | `shadowfox.pages.dev` | Text |

`ALLOWED_DOMAINS` verhindert, dass Fremde euren Login-Dienst mitbenutzen. Nicht weglassen.

### E4. Adresse eintragen

Im Repo `admin/config.yml` öffnen, Zeile mit `base_url` auf deine Worker-Adresse ändern
(**ohne** `/callback`):

```yaml
base_url: https://sveltia-cms-auth.dein-name.workers.dev
```

**Commit changes.** Fertig — `https://shadowfox.pages.dev/admin/` aufrufen, mit GitHub
anmelden, und ihr könnt loslegen.

Was ihr dort bearbeiten könnt:

- **Boss-Taktiken** — jeder Boss mit Ansagen, aufgeteilt nach Tanks, Heilern, DPS
- **Raid-Kader** — Namen, Rollen, Vorstellungstexte
- **Wissens-Artikel** — die acht Vorlagen mit Inhalt füllen
- **Gilde & Termine** — Raidzeiten, Motto, gesuchte Klassen, Ansprechpartner

Jede Speicherung geht direkt live.

---

## F — Eigene Adresse (optional, 15 Minuten)

`shadowfox.pages.dev` funktioniert dauerhaft und kostet nichts. Wollt ihr etwas wie
`shadowfox-gilde.de`:

1. Domain kaufen — bei einem deutschen Anbieter etwa 10 bis 15 Euro im Jahr,
   oder direkt bei Cloudflare zum Selbstkostenpreis
2. Cloudflare-Dashboard → dein Pages-Projekt → **Custom domains** → **Set up a domain**
3. Cloudflare sagt dir genau, welche zwei Einträge du beim Domain-Anbieter hinterlegen musst

Danach in `admin/config.yml` und in der Worker-Variable `ALLOWED_DOMAINS` die neue Adresse
nachtragen, sonst funktioniert der CMS-Login nicht mehr.

---

## Wenn etwas klemmt

**Die Seite zeigt alte Zahlen.**
Actions-Reiter → letzten Lauf ansehen. Steht dort ✕ bei einer Quelle, sagt die Fehlermeldung
warum — meist ein Tippfehler im Secret-Namen. Die Namen sind Groß-/Kleinschreibungs-empfindlich.

**Ein Spieler fehlt im Tracker.**
Dann findet Raider.IO den Namen nicht. Im Protokoll des Actions-Laufs steht unter
„nicht gefunden" wer. Meist ein Sonderzeichen oder ein Twink statt des Mains.

**Die Automatik läuft plötzlich nicht mehr.**
GitHub schaltet geplante Abläufe in öffentlichen Repos ab, wenn 60 Tage lang niemand
etwas am Repo geändert hat. Actions-Reiter → Workflow anklicken → **Enable workflow**.
Solange ihr Taktiken pflegt, passiert das nie.

**Der CMS-Login geht nicht.**
Fast immer die Callback-URL: sie muss **exakt** auf `/callback` enden. Und `ALLOWED_DOMAINS`
muss eure tatsächliche Adresse enthalten.

**Die Seite lädt, aber die Konsole zeigt 404-Meldungen.**
Normal, solange nicht alle Quellen eingerichtet sind. Die Website fragt alle Datendateien
ab und blendet aus, was noch nicht da ist. Kaputt ist nichts.

---

## Was du selbst noch prüfen solltest

Vier Angaben in dieser Anleitung konnte ich technisch nicht gegenprüfen, weil die
betreffenden Seiten Anmeldung verlangen oder automatisierte Zugriffe blockieren.
Sie sind oben jeweils gekennzeichnet:

1. Der genaue Raid-Helper-Befehl für den API-Schlüssel
2. Die Feldbezeichnungen im Blizzard-Entwicklerportal
3. Die Beschriftung auf der WoWAudit-Team-API-Seite
4. Der genaue Name des Menüpunkts im Cloudflare-Dashboard

Wenn dir dort etwas anders begegnet als beschrieben: sag mir, was du siehst, dann
korrigiere ich die Anleitung.
