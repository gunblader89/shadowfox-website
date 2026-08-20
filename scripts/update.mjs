#!/usr/bin/env node
/* =====================================================================
   Holt alle Daten und schreibt sie nach ./data/*.json
   Jede Quelle ist einzeln abgesichert: fehlt ein Key oder ist eine API
   gerade nicht erreichbar, wird nur diese eine Quelle übersprungen —
   die Website läuft mit den zuletzt geholten Daten weiter.
   ===================================================================== */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as rio       from "./lib/raiderio.mjs";
import * as raidhelp  from "./lib/raidhelper.mjs";
import * as wcl       from "./lib/warcraftlogs.mjs";
import * as audit     from "./lib/wowaudit.mjs";
import * as bnet      from "./lib/blizzard.mjs";
import { ok, skip, fail, log } from "./lib/util.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

/* --- .env lesen, falls vorhanden (nur fürs lokale Testen) --- */
if (existsSync(join(ROOT, ".env"))) {
  const txt = await readFile(join(ROOT, ".env"), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  log(".env geladen");
}

const env = k => (process.env[k] ?? "").trim();
const GUILD = {
  region: env("GUILD_REGION") || "eu",
  realm:  env("GUILD_REALM")  || "blackmoore",
  name:   env("GUILD_NAME")   || "ShadowFox"
};

const write = async (file, obj) => {
  await mkdir(DATA, { recursive: true });
  await writeFile(join(DATA, file), JSON.stringify(obj, null, 2) + "\n", "utf8");
  log(`geschrieben: data/${file}`);
};

/* Kaderliste kommt aus content/raider.json — das pflegt ihr im CMS. */
async function kaderNames() {
  try {
    const raw = await readFile(join(ROOT, "content", "raider.json"), "utf8");
    const j = JSON.parse(raw);
    return (j.raider ?? []).filter(r => r.aktiv !== false).map(r => r.name);
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- */
console.log(`\n  ShadowFox — Datenabgleich  (${new Date().toLocaleString("de-DE")})\n`);
let errors = 0;

/* 1) Raider.IO — Gildenprofil. Braucht keinen Key, läuft immer. */
try {
  await write("guild.json", await rio.guildProfile(GUILD));
} catch (e) { errors++; fail(`Raider.IO Gildenprofil: ${e.message}`); }

/* 2) Raider.IO — Charaktere des Kaders */
const namen = await kaderNames();
if (namen.length) {
  try {
    const chars = await rio.characters(namen, GUILD);
    // Schutz: eine leere Antwort darf gute Daten nicht ueberschreiben.
    if (chars.length) {
      await write("roster.json", { characters: chars, updatedAt: new Date().toISOString() });
    } else {
      errors++; fail("Raider.IO lieferte 0 Charaktere — data/roster.json bleibt unveraendert");
    }
  } catch (e) { errors++; fail(`Raider.IO Charaktere: ${e.message}`); }
} else {
  skip("Kader: content/raider.json ist leer — keine Charakterdaten geholt");
}

/* 3) Raid-Helper */
if (env("RAIDHELPER_API_KEY") && env("RAIDHELPER_SERVER_ID")) {
  try {
    await write("events.json", await raidhelp.events({
      apiKey: env("RAIDHELPER_API_KEY"),
      serverId: env("RAIDHELPER_SERVER_ID")
    }));
  } catch (e) { errors++; fail(`Raid-Helper: ${e.message}`); }
} else skip("Raid-Helper: kein Key gesetzt — übersprungen");

/* 4) Warcraft Logs */
if (env("WCL_CLIENT_ID") && env("WCL_CLIENT_SECRET")) {
  try {
    await write("logs.json", await wcl.reports({
      clientId: env("WCL_CLIENT_ID"),
      clientSecret: env("WCL_CLIENT_SECRET"),
      ...GUILD
    }));
  } catch (e) { errors++; fail(`Warcraft Logs: ${e.message}`); }
} else skip("Warcraft Logs: kein Client gesetzt — übersprungen");

/* 5) WoWAudit */
if (env("WOWAUDIT_API_KEY")) {
  try {
    await write("wowaudit.json", await audit.team({ apiKey: env("WOWAUDIT_API_KEY") }));
  } catch (e) { errors++; fail(`WoWAudit: ${e.message}`); }
} else skip("WoWAudit: kein Key gesetzt — übersprungen");

/* 6) Blizzard — Ränge und M+-Wochenruns */
if (env("BLIZZARD_CLIENT_ID") && env("BLIZZARD_CLIENT_SECRET")) {
  try {
    const roster = await bnet.guildRoster({
      clientId: env("BLIZZARD_CLIENT_ID"),
      clientSecret: env("BLIZZARD_CLIENT_SECRET"),
      ...GUILD
    });
    let keys = [];
    if (namen.length) {
      keys = await bnet.weeklyKeys({
        token: roster.token, region: GUILD.region, realm: GUILD.realm, names: namen
      });
    }
    delete roster.token;                     // Token gehört nicht in eine Datei
    await write("blizzard.json", { ...roster, weeklyKeys: keys });
  } catch (e) { errors++; fail(`Blizzard: ${e.message}`); }
} else skip("Blizzard: kein Client gesetzt — übersprungen");

/* Statusdatei — die Website zeigt daraus an, wie frisch die Daten sind */
await write("status.json", {
  updatedAt: new Date().toISOString(),
  guild: GUILD,
  sources: {
    raiderio:     true,
    raidhelper:   Boolean(env("RAIDHELPER_API_KEY")),
    warcraftlogs: Boolean(env("WCL_CLIENT_ID")),
    wowaudit:     Boolean(env("WOWAUDIT_API_KEY")),
    blizzard:     Boolean(env("BLIZZARD_CLIENT_ID"))
  },
  errors
});

console.log(errors ? `\n  Fertig mit ${errors} Fehler(n) — die übrigen Daten sind aktuell.\n`
                   : `\n  Fertig. Alles aktuell.\n`);
/* Bewusst kein exit(1): ein Ausfall einer fremden API soll den Workflow
   nicht rot färben, solange die anderen Quellen geliefert haben. */
