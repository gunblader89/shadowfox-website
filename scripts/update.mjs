#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as rio       from "./lib/raiderio.mjs";
import * as raidhelp  from "./lib/raidhelper.mjs";
import * as wcl       from "./lib/warcraftlogs.mjs";
import * as audit     from "./lib/wowaudit.mjs";
import * as bnet      from "./lib/blizzard.mjs";
import * as youtube    from "./lib/youtube.mjs";
import { ok, skip, fail, log } from "./lib/util.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

if (existsSync(join(ROOT, ".env"))) {
  const txt = await readFile(join(ROOT, ".env"), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
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

console.log(`\n  ShadowFox — Datenabgleich  (${new Date().toLocaleString("de-DE")})\n`);
let errors = 0;

/* 1) Raider.IO Gildenprofil */
try {
  await write("guild.json", await rio.guildProfile(GUILD));
} catch (e) { errors++; fail(`Raider.IO Gildenprofil: ${e.message}`); }

/* 2) WoWAudit */
let auditData = null;
if (env("WOWAUDIT_API_KEY")) {
  try {
    auditData = await audit.team({ apiKey: env("WOWAUDIT_API_KEY") });
    await write("wowaudit.json", auditData);
  } catch (e) { errors++; fail(`WoWAudit: ${e.message}`); }
} else skip("WoWAudit: kein Key gesetzt");

/* Charakterliste: WoWAudit ist die massgeblich gepflegte Quelle (Team Mythic,
   von der Gildenleitung dort aktuell gehalten) - wird sie erfolgreich
   geladen, bestimmt SIE allein den Kader. content/raider.json wuerde sonst
   dauerhaft "veralteten" gegenueber WoWAudit driften: wird dort jemand aus
   dem Team entfernt, bliebe er als Karteileiche auf der Website haengen,
   solange niemand zusaetzlich raider.json von Hand nachzieht. raider.json
   dient nur noch als Fallback, falls WoWAudit (noch) nicht konfiguriert ist
   oder der Abruf fehlschlaegt. */
let charList = [];
if (auditData?.characters?.length) {
  charList = auditData.characters.map(c => ({
    name: c.name,
    realm: c.realm ? c.realm.toLowerCase().replace(/\s+/g, "-") : GUILD.realm,
    class: c.class,
    role: c.role
  }));
} else {
  try {
    const raw = await readFile(join(ROOT, "content", "raider.json"), "utf8");
    const j = JSON.parse(raw);
    charList = (j.raider ?? [])
      .filter(r => r.aktiv !== false)
      .map(r => ({ name: r.name, realm: GUILD.realm, class: r.klasse, role: r.rolle }));
  } catch { /* content/raider.json fehlt oder ist kaputt - dann bleibt der Kader leer */ }
}

/* 3) Raider.IO Charaktere */
let chars = [];
if (charList.length) {
  try {
    chars = await rio.characters(charList, GUILD);
    if (chars.length) {
      await write("roster.json", { characters: chars, updatedAt: new Date().toISOString() });
    }
  } catch (e) { errors++; fail(`Raider.IO Charaktere: ${e.message}`); }
}

/* 4) Blizzard */
let blizzardKeys = [];
if (env("BLIZZARD_CLIENT_ID") && env("BLIZZARD_CLIENT_SECRET")) {
  try {
    const roster = await bnet.guildRoster({
      clientId: env("BLIZZARD_CLIENT_ID"),
      clientSecret: env("BLIZZARD_CLIENT_SECRET"),
      ...GUILD
    });
    if (charList.length) {
      const namesOnly = charList.map(c => c.name);
      blizzardKeys = await bnet.weeklyKeys({
        token: roster.token, region: GUILD.region, realm: GUILD.realm, names: namesOnly
      });
    }
    delete roster.token;
    await write("blizzard.json", { ...roster, weeklyKeys: blizzardKeys });
  } catch (e) { errors++; fail(`Blizzard: ${e.message}`); }
} else skip("Blizzard: kein Client gesetzt");

/* 5) Raid-Helper */
if (env("RAIDHELPER_API_KEY") && env("RAIDHELPER_SERVER_ID")) {
  try {
    const eventsResult = await raidhelp.events({
      apiKey: env("RAIDHELPER_API_KEY"),
      serverId: env("RAIDHELPER_SERVER_ID")
    });
    await write("events.json", eventsResult);
  } catch (e) { errors++; fail(`Raid-Helper: ${e.message}`); }
}

/* 6) Warcraft Logs */
if (env("WCL_CLIENT_ID") && env("WCL_CLIENT_SECRET")) {
  try {
    await write("logs.json", await wcl.reports({
      clientId: env("WCL_CLIENT_ID"),
      clientSecret: env("WCL_CLIENT_SECRET"),
      ...GUILD,
      rosterNames: charList.map(c => c.name)
    }));
  } catch (e) { errors++; fail(`Warcraft Logs: ${e.message}`); }
}

/* 7) YouTube — oeffentlicher RSS-Feed, kein API-Key noetig. Channel-ID ist
   keine geheime Information, daher per Env konfigurierbar mit sinnvollem
   Standardwert (der Kill-Video-Kanal der Gilde). */
const YOUTUBE_CHANNEL_ID = env("YOUTUBE_CHANNEL_ID") || "UCyS--qgoP2FMaVEFm3VeXiw";
try {
  const fetched = await youtube.latestVideos({ channelId: YOUTUBE_CHANNEL_ID });
  let existingVideos = null;
  try { existingVideos = JSON.parse(await readFile(join(DATA, "youtube.json"), "utf8")); } catch { /* erster Lauf */ }
  const videosResult = youtube.mergeVideos({ existing: existingVideos, fetched });
  await write("youtube.json", videosResult);
  ok(`YouTube: ${fetched.length} Videos im Feed, ${Object.keys(videosResult.videos).length} insgesamt archiviert`);
} catch (e) { errors++; fail(`YouTube: ${e.message}`); }

await write("status.json", {
  updatedAt: new Date().toISOString(),
  guild: GUILD,
  sources: {
    raiderio: true,
    raidhelper: Boolean(env("RAIDHELPER_API_KEY")),
    warcraftlogs: Boolean(env("WCL_CLIENT_ID")),
    wowaudit: Boolean(env("WOWAUDIT_API_KEY")),
    blizzard: Boolean(env("BLIZZARD_CLIENT_ID")),
    youtube: true
  },
  errors
});

console.log(`\n  Fertig mit ${errors} Fehler(n).\n`);
