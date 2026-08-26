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
import { skip, fail, log } from "./lib/util.mjs";

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

/* Charaktere aus WoWAudit UND content/raider.json zusammenfuehren — vorher
   wurde raider.json komplett ignoriert, sobald WoWAudit aktiv war. Dadurch
   fehlten im Roster alle Raider, die nur manuell in raider.json gepflegt
   sind, aber (noch) nicht in WoWAudit registriert wurden. */
let charList = [];
const seenNames = new Set();
if (auditData?.characters?.length) {
  for (const c of auditData.characters) {
    charList.push({
      name: c.name,
      realm: c.realm ? c.realm.toLowerCase().replace(/\s+/g, "-") : GUILD.realm,
      class: c.class,
      role: c.role
    });
    seenNames.add(c.name.toLowerCase());
  }
}
try {
  const raw = await readFile(join(ROOT, "content", "raider.json"), "utf8");
  const j = JSON.parse(raw);
  for (const r of (j.raider ?? [])) {
    if (r.aktiv === false) continue;
    if (seenNames.has(r.name.toLowerCase())) continue;
    charList.push({ name: r.name, realm: GUILD.realm, class: r.klasse, role: r.rolle });
    seenNames.add(r.name.toLowerCase());
  }
} catch { /* content/raider.json fehlt oder ist kaputt - WoWAudit-Liste reicht dann allein */ }

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
    await write("events.json", await raidhelp.events({
      apiKey: env("RAIDHELPER_API_KEY"),
      serverId: env("RAIDHELPER_SERVER_ID")
    }));
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

await write("status.json", {
  updatedAt: new Date().toISOString(),
  guild: GUILD,
  sources: {
    raiderio: true,
    raidhelper: Boolean(env("RAIDHELPER_API_KEY")),
    warcraftlogs: Boolean(env("WCL_CLIENT_ID")),
    wowaudit: Boolean(env("WOWAUDIT_API_KEY")),
    blizzard: Boolean(env("BLIZZARD_CLIENT_ID"))
  },
  errors
});

console.log(`\n  Fertig mit ${errors} Fehler(n).\n`);
