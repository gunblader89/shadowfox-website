/* Warcraft Logs — Alle echten Raidabende, dedupliziert & Top-2-DPS/HPS-Parses */
import { req, ok, log } from "./util.mjs";

const BASE_OAUTH = "https://www.warcraftlogs.com/oauth/token";
const BASE_API   = "https://www.warcraftlogs.com/api/v2/client";

async function token(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await req(BASE_OAUTH, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  return res.access_token;
}

const DEFAULT_BOSS_NAMES = [
  "Nek'zali the Soulcoiler", "Entombed Sentinels", "Vashnik the Malignant",
  "The Lost Explorers", "Sszorak", "The Twin Fangs", "The Coiled Altar", "Ula'tek"
];

const normalizeName = s => String(s).split("-")[0].trim().toLowerCase();

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 25, zoneName = "The Venomous Abyss", bossNames = DEFAULT_BOSS_NAMES, rosterNames = [] }) {
  const bossNameSet = new Set(bossNames.map(n => n.toLowerCase().trim()));
  const rosterSet = new Set(rosterNames.map(normalizeName));
  const tok = await token(clientId, clientSecret);

  // Alle Berichte der Gilde abfragen
  const q = `query {
    reportData {
      reports(guildName: "${name}", guildServerSlug: "${realm}", guildServerRegion: "${region}", limit: ${limit}) {
        data {
          code
          title
          startTime
          endTime
          zone { id name }
          fights(killType: Encounters) {
            id
            name
            difficulty
            kill
            startTime
            endTime
          }
          masterData {
            actors(type: "Player") { name }
          }
          owner { name }
        }
      }
    }
  }`;

  const res = await req(BASE_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });

  const rawReports = res.data?.reportData?.reports?.data ?? [];

  // Nur Reports aus der aktuellen Raid-Zone werten. Die guildName-Abfrage
  // liefert JEDEN Report, der irgendwie mit der Gilde verknuepft ist — auch
  // private Mythic-Plus-/Pug-Laeufe einzelner Mitglieder, keine offiziellen
  // Raidabende. Ohne diesen Filter koennen solche Fremd-Reports beim
  // Zeitfenster-Clustering (siehe unten) faelschlich mit einem echten
  // Raidabend verschmolzen werden.
  const raidZoneReports = rawReports.filter(r => r.zone?.name === zoneName);
  log(`WCL: ${rawReports.length} Reports insgesamt, ${raidZoneReports.length} in Zone "${zoneName}", ${rosterSet.size} bekannte Kader-Namen`);

  // Besetzungs- & Uploader-Check: selbst bei passender Zone und echten
  // Raidbossen kann ein Report ein Pug/Alt-Run sein, den jemand Fremdes
  // (oder ein einzelnes Mitglied ausserhalb eines offiziellen Raids)
  // hochgeladen hat. Nur werten, wenn der Uploader selbst zum Kader
  // gehoert UND ein Grossteil der Teilnehmer bekannte Mitglieder sind.
  const rosterReports = rosterSet.size > 0
    ? raidZoneReports.filter(r => {
        const ownerName = r.owner?.name;
        const actors = r.masterData?.actors ?? [];
        const matches = actors.filter(a => rosterSet.has(normalizeName(a.name))).length;
        const ratio = actors.length ? (matches / actors.length) : 0;
        const ownerOk = Boolean(ownerName) && rosterSet.has(normalizeName(ownerName));
        const accepted = ownerOk && actors.length > 0 && ratio >= 0.4;
        log(`  Report ${r.code}: owner="${ownerName ?? "?"}" (bekannt: ${ownerOk}), ${matches}/${actors.length} Teilnehmer bekannt (${Math.round(ratio*100)}%) -> ${accepted ? "gewertet" : "ausgeschlossen"}`);
        return accepted;
      })
    : raidZoneReports;

  // Nur Fights werten, deren Name zu einem der echten Raidbosse passt —
  // ein einzelner WCL-Report kann trotz passender Zone auch Fights aus
  // anderem Content enthalten (z.B. wenn ein Mitglied das Logging beim
  // Wechsel von Dungeon zu Raid einfach weiterlaufen laesst). Die Zone
  // allein reicht also nicht, der Namensabgleich ist der eigentliche Filter.
  // fight.startTime/endTime sind bei WCL relativ zum jeweiligen Report,
  // deshalb hier auf absolute Zeitstempel umrechnen — sonst sind sie beim
  // Zusammenfuehren mehrerer Reports (siehe unten) nicht vergleichbar.
  const withRaidFights = rosterReports
    .map(r => ({
      ...r,
      raidFights: (r.fights ?? [])
        .filter(f => [3, 4, 5].includes(f.difficulty) && bossNameSet.has(String(f.name).toLowerCase().trim()))
        .map(f => ({ ...f, absStart: r.startTime + f.startTime, absEnd: r.startTime + f.endTime }))
    }))
    .filter(r => r.raidFights.length > 0);

  // Zeitfenster-Clustering (9h): mehrere WCL-Reports vom selben Raidabend
  // (z.B. nach einem Disconnect/Neustart des Logs) zu einem Eintrag zusammenfassen,
  // statt denselben Abend mehrfach anzuzeigen.
  const sorted = [...withRaidFights].sort((a, b) => b.startTime - a.startTime);
  const clusters = [];
  for (const r of sorted) {
    const match = clusters.find(c => Math.abs(c.startTime - r.startTime) < 9 * 3600 * 1000);
    if (match) match.reports.push(r);
    else clusters.push({ startTime: r.startTime, reports: [r] });
  }

  const diffMap = { 3: "Normal", 4: "Heroisch", 5: "Mythisch" };

  const resultReports = clusters.map(c => {
    const allFights = c.reports.flatMap(r => r.raidFights);
    const kills = allFights.filter(f => f.kill);
    const wipes = allFights.filter(f => !f.kill);
    const uniqueKilled = [...new Set(kills.map(f => f.name))];

    // Repraesentativer Report der Nacht = der mit den meisten echten Kills
    // (i.d.R. der vollstaendige Log, nicht ein abgebrochenes Fragment).
    const master = c.reports.reduce((best, cur) =>
      cur.raidFights.filter(f => f.kill).length > best.raidFights.filter(f => f.kill).length ? cur : best
    , c.reports[0]);

    const firstPull = Math.min(...allFights.map(f => f.absStart));
    const lastPull = Math.max(...allFights.map(f => f.absEnd));
    const durMs = Math.max(0, lastPull - firstPull);
    const hours = Math.floor(durMs / 3600000);
    const mins = Math.floor((durMs % 3600000) / 60000);

    const maxDiff = Math.max(...allFights.map(f => f.difficulty || 3));

    return {
      code: master.code,
      url: `https://www.warcraftlogs.com/reports/${master.code}`,
      title: master.title || master.zone?.name || "Der Giftige Abgrund",
      zone: master.zone?.name || "Der Giftige Abgrund",
      startTime: firstPull,
      endTime: lastPull,
      duration: `${hours > 0 ? hours + 'h ' : ''}${mins}m`,
      difficulty: diffMap[maxDiff] || "Normal",
      kills: uniqueKilled.length,
      wipes: wipes.length,
      killedBosses: uniqueKilled,
      vips: { dps: [], hps: [] }
    };
  }).sort((a, b) => b.startTime - a.startTime);

  // VIP-Parses für den aktuellsten (zusammengefuehrten) Raidabend
  if (resultReports.length > 0) {
    const latest = resultReports[0];

    try {
      const qParses = `query {
        reportData {
          report(code: "${latest.code}") {
            dpsRankings: rankings(playerMetric: dps)
            hpsRankings: rankings(playerMetric: hps)
          }
        }
      }`;

      const pRes = await req(BASE_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: qParses })
      });

      // GraphQL antwortet bei ungueltigen Feldern/Argumenten trotzdem mit HTTP 200 —
      // req() prueft nur den HTTP-Status, deshalb hier zusaetzlich auf "errors" achten,
      // sonst bleiben VIP-Parses bei einem Tippfehler wochenlang unbemerkt leer.
      if (pRes.errors?.length) {
        throw new Error(pRes.errors.map(e => e.message).join("; "));
      }

      const reportData = pRes.data?.reportData?.report;
      const dpsRankData = reportData?.dpsRankings?.data ?? [];
      const hpsRankData = reportData?.hpsRankings?.data ?? [];

      let dpsList = [];
      let hpsList = [];

      // Echte DPS-Parses aus den Kills
      for (const fight of dpsRankData) {
        const bossName = fight.encounter?.name || "Boss";
        for (const ch of fight.roles?.dps?.characters || []) {
          if (ch.name && ch.rankPercent != null) {
            dpsList.push({
              name: ch.name,
              class: ch.class,
              spec: ch.spec || "",
              parse: Math.round(ch.rankPercent),
              boss: bossName
            });
          }
        }
      }

      // Echte HPS-Parses aus den Kills (Heiler)
      for (const fight of hpsRankData) {
        const bossName = fight.encounter?.name || "Boss";
        for (const ch of fight.roles?.healers?.characters || []) {
          if (ch.name && ch.rankPercent != null) {
            hpsList.push({
              name: ch.name,
              class: ch.class,
              spec: ch.spec || "",
              parse: Math.round(ch.rankPercent),
              boss: bossName
            });
          }
        }
      }

      dpsList.sort((a, b) => b.parse - a.parse);
      hpsList.sort((a, b) => b.parse - a.parse);

      // Top 2 DPS (dedupliziert)
      const topDps = [];
      for (const d of dpsList) {
        if (!topDps.some(x => x.name.toLowerCase() === d.name.toLowerCase())) {
          topDps.push(d);
          if (topDps.length === 2) break;
        }
      }

      // Top 2 Heiler (dedupliziert)
      const topHps = [];
      for (const h of hpsList) {
        if (!topHps.some(x => x.name.toLowerCase() === h.name.toLowerCase())) {
          topHps.push(h);
          if (topHps.length === 2) break;
        }
      }

      latest.vips = { dps: topDps, hps: topHps };
    } catch (e) {
      // Fehlertoleranz bei reinen Wipe-Abenden ohne Kills — aber sichtbar bleiben,
      // damit ein echter Fehler (Tippfehler, API-Aenderung) nicht wieder wochenlang
      // unbemerkt bleibt.
      log(`VIP-Parses uebersprungen: ${e.message}`);
    }
  }

  ok(`Warcraft Logs: ${resultReports.length} Raidabende geladen (dedupliziert)`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
