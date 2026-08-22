/* Warcraft Logs — Saubere Raid-Abfrage ohne M+-Vermischung */
import { req, ok } from "./util.mjs";

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

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 10 }) {
  const tok = await token(clientId, clientSecret);
  
  // Nur Berichte mit echten Raid-Encountern abfragen
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
    // Nur Reports werten, die tatsächliche Raid-Bosskämpfe beinhalten (mindestens 1 Boss-Pull)
    if (!fights.length) continue;

    const kills = fights.filter(f => f.kill);
    const wipes = fights.filter(f => !f.kill);
    const uniqueKilled = [...new Set(kills.map(f => f.name))];

    // Exakte Raiddauer von erstem bis letztem Kampf berechnen
    let durMs = (r.endTime || 0) - (r.startTime || 0);
    if (fights.length > 1) {
      const startFight = Math.min(...fights.map(f => f.startTime));
      const endFight = Math.max(...fights.map(f => f.endTime));
      if (endFight > startFight) {
        durMs = endFight - startFight;
      }
    }

    const hours = Math.floor(durMs / 3600000);
    const mins = Math.floor((durMs % 3600000) / 60000);
    const durStr = `${hours > 0 ? hours + 'h ' : ''}${mins}m`;

    const diffMap = { 3: "Normal", 4: "Heroisch", 5: "Mythisch" };
    const highestDiff = Math.max(...fights.map(f => f.difficulty || 3));
    const diff = diffMap[highestDiff] || "Normal";

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

  // Sortieren nach Datum (neuester Raid zuerst)
  resultReports.sort((a, b) => b.startTime - a.startTime);

  // VIP-Parses für den aktuellsten Raidabend abrufen
  if (resultReports.length > 0) {
    const latest = resultReports[0];

    try {
      const qParses = `query {
        reportData {
          report(code: "${latest.code}") {
            dpsRankings: rankings(metric: dps)
            hpsRankings: rankings(metric: hps)
          }
        }
      }`;

      const pRes = await req(BASE_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: qParses })
      });

      const reportData = pRes.data?.reportData?.report;
      const dpsRankData = reportData?.dpsRankings?.data ?? [];
      const hpsRankData = reportData?.hpsRankings?.data ?? [];

      let dpsList = [];
      let hpsList = [];

      // Echte DPS-Parses aus den Kills ziehen
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

      // Echte HPS-Parses aus den Kills ziehen (nur Heiler)
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

      // Deduplizieren (jeder Spieler max. 1x bei den Top 2)
      const topDps = [];
      for (const d of dpsList) {
        if (!topDps.some(x => x.name.toLowerCase() === d.name.toLowerCase())) {
          topDps.push(d);
          if (topDps.length === 2) break;
        }
      }

      const topHps = [];
      for (const h of hpsList) {
        if (!topHps.some(x => x.name.toLowerCase() === h.name.toLowerCase())) {
          topHps.push(h);
          if (topHps.length === 2) break;
        }
      }

      latest.vips = { dps: topDps, hps: topHps };
    } catch {
      // Fehlertoleranz
    }
  }

  ok(`Warcraft Logs: ${resultReports.length} Raidabende geladen`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
