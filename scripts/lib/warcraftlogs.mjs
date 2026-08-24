/* Warcraft Logs — Alle echten Raidabende & exakte Kills/Wipes */
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

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 25 }) {
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
  const resultReports = [];

  for (const r of rawReports) {
    const fights = r.fights ?? [];
    
    // Nur echte Raid-Pulls werten (Normal, Heroisch, Mythisch) — schließt M+ Dungeons aus
    const raidFights = fights.filter(f => [3, 4, 5].includes(f.difficulty));
    if (!raidFights.length) continue;

    const kills = raidFights.filter(f => f.kill);
    const wipes = raidFights.filter(f => !f.kill);
    const uniqueKilled = [...new Set(kills.map(f => f.name))];

    // Exakte Dauer von erstem bis letztem Pull berechnen
    let durMs = (r.endTime || 0) - (r.startTime || 0);
    if (raidFights.length > 1) {
      const firstPull = Math.min(...raidFights.map(f => f.startTime));
      const lastPull = Math.max(...raidFights.map(f => f.endTime));
      if (lastPull > firstPull) {
        durMs = lastPull - firstPull;
      }
    }

    const hours = Math.floor(durMs / 3600000);
    const mins = Math.floor((durMs % 3600000) / 60000);
    const durStr = `${hours > 0 ? hours + 'h ' : ''}${mins}m`;

    const diffMap = { 3: "Normal", 4: "Heroisch", 5: "Mythisch" };
    const maxDiff = Math.max(...raidFights.map(f => f.difficulty || 3));
    const diff = diffMap[maxDiff] || "Normal";

    resultReports.push({
      code: r.code,
      url: `https://www.warcraftlogs.com/reports/${r.code}`,
      title: r.title || r.zone?.name || "Der Giftige Abgrund",
      zone: r.zone?.name || "Der Giftige Abgrund",
      startTime: r.startTime,
      endTime: r.endTime,
      duration: durStr,
      difficulty: diff,
      kills: kills.length,
      wipes: wipes.length,
      killedBosses: uniqueKilled,
      vips: { dps: [], hps: [] }
    });
  }

  // Neueste Raids zuerst sortieren
  resultReports.sort((a, b) => b.startTime - a.startTime);

  // VIP-Parses für den aktuellsten Raidabend direkt aus den Kills holen
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

  ok(`Warcraft Logs: ${resultReports.length} echte Raidabende geladen`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
