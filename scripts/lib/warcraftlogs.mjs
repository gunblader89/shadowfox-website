/* Warcraft Logs — Deduplizierung & Top 2 DPS / Top 2 HPS Parses */
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

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 16 }) {
  const tok = await token(clientId, clientSecret);
  const q = `query {
    reportData {
      reports(guildName: "${name}", guildServerSlug: "${realm}", guildServerRegion: "${region}", limit: ${limit}) {
        data {
          code
          title
          startTime
          endTime
          zone { name }
          fights(killType: Encounters) {
            id
            name
            difficulty
            kill
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
  const sorted = [...rawReports].sort((a, b) => b.startTime - a.startTime);

  // Zeitfenster-Clustering (9h) zur Deduplizierung
  const clusters = [];
  for (const r of sorted) {
    const match = clusters.find(c => Math.abs(c.startTime - r.startTime) < 9 * 3600 * 1000);
    if (match) match.reports.push(r);
    else clusters.push({ startTime: r.startTime, reports: [r] });
  }

  const resultReports = [];

  for (const c of clusters) {
    const allFights = c.reports.flatMap(r => r.fights ?? []);
    const uniqueKilled = [...new Set(allFights.filter(f => f.kill).map(f => f.name))];
    
    const master = c.reports.reduce((best, cur) => {
      const curKills = (cur.fights ?? []).filter(f => f.kill).length;
      const bestKills = (best.fights ?? []).filter(f => f.kill).length;
      return curKills >= bestKills ? cur : best;
    }, c.reports[0]);

    const durMs = Math.max(0, (master.endTime || 0) - (master.startTime || 0));
    const wipes = allFights.filter(f => !f.kill).length;
    const diff = allFights.some(f => f.difficulty === 5) ? "Mythisch" : allFights.some(f => f.difficulty === 4) ? "Heroisch" : "Normal";

    resultReports.push({
      code: master.code,
      url: `https://www.warcraftlogs.com/reports/${master.code}`,
      title: master.title,
      zone: master.zone?.name || "Der Giftige Abgrund",
      startTime: master.startTime,
      endTime: master.endTime,
      duration: `${Math.floor(durMs / 3600000)}h ${Math.floor((durMs % 3600000) / 60000)}m`,
      difficulty: diff,
      kills: Math.max(uniqueKilled.length, master.fights?.filter(f => f.kill).length ?? 0),
      wipes: Math.max(wipes, master.fights?.filter(f => !f.kill).length ?? 0),
      killedBosses: uniqueKilled,
      vips: { dps: [], hps: [] }
    });
  }

  // VIP-Parses für den neuesten Report abrufen
  if (resultReports.length > 0) {
    const latest = resultReports[0];
    const durMs = Math.max(1000, (latest.endTime || 0) - (latest.startTime || 0));

    try {
      // Getrennte Abfrage: DPS-Rankings vs. HPS-Rankings (metric: hps)
      const qParses = `query {
        reportData {
          report(code: "${latest.code}") {
            dpsRankings: rankings(metric: dps)
            hpsRankings: rankings(metric: hps)
            fights(killType: Kills) { name }
            dpsTable: table(dataType: DamageDone, startTime: 0, endTime: ${durMs})
            hpsTable: table(dataType: Healing, startTime: 0, endTime: ${durMs})
          }
        }
      }`;

      const pRes = await req(BASE_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: qParses })
      });

      const reportData = pRes.data?.reportData?.report;
      const dpsRankData = reportData?.dpsRankings?.data;
      const hpsRankData = reportData?.hpsRankings?.data;
      let dpsList = [];
      let hpsList = [];

      // 1. DPS aus Schadens-Rankings
      if (Array.isArray(dpsRankData) && dpsRankData.length > 0) {
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
      }

      // 2. HPS aus echten Heilungs-Rankings (metric: hps)
      if (Array.isArray(hpsRankData) && hpsRankData.length > 0) {
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
      }

      dpsList.sort((a, b) => b.parse - a.parse);
      hpsList.sort((a, b) => b.parse - a.parse);

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

      // Fallback auf Table-Daten, falls WCL Rankings noch in Berechnung sind
      if (topDps.length < 2) {
        const dpsEntries = reportData?.dpsTable?.data?.entries || [];
        for (const e of dpsEntries) {
          if (e.name && !topDps.some(x => x.name.toLowerCase() === e.name.toLowerCase())) {
            topDps.push({ name: e.name, class: e.type, spec: "", parse: e.rankPercent ? Math.round(e.rankPercent) : 90, boss: "Gesamtraid" });
            if (topDps.length === 2) break;
          }
        }
      }
      if (topHps.length < 2) {
        const hpsEntries = reportData?.hpsTable?.data?.entries || [];
        for (const e of hpsEntries) {
          if (e.name && !topHps.some(x => x.name.toLowerCase() === e.name.toLowerCase())) {
            topHps.push({ name: e.name, class: e.type, spec: "", parse: e.rankPercent ? Math.round(e.rankPercent) : 90, boss: "Gesamtraid" });
            if (topHps.length === 2) break;
          }
        }
      }

      latest.vips = { dps: topDps, hps: topHps };
    } catch {
      // Fehlertoleranz
    }
  }

  ok(`Warcraft Logs: ${resultReports.length} deduplizierte Raidabende geladen`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
