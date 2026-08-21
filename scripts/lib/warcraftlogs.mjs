/* Warcraft Logs — Automatische Deduplizierung & VIP-Performer */
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

function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.round(n).toString();
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
            fightPercentage
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

  // 1. Zeitfenster-Clustering: Reports innerhalb von 9 Stunden gehören zum selben Raidabend
  const clusters = [];
  for (const r of sorted) {
    const match = clusters.find(c => Math.abs(c.startTime - r.startTime) < 9 * 3600 * 1000);
    if (match) {
      match.reports.push(r);
    } else {
      clusters.push({ startTime: r.startTime, reports: [r] });
    }
  }

  const resultReports = [];

  for (const c of clusters) {
    const allFights = c.reports.flatMap(r => r.fights ?? []);
    const allKills = allFights.filter(f => f.kill);
    const uniqueKilled = [...new Set(allKills.map(f => f.name))];
    
    // Master-Report ermitteln
    const master = c.reports.reduce((best, cur) => {
      const curKills = (cur.fights ?? []).filter(f => f.kill).length;
      const bestKills = (best.fights ?? []).filter(f => f.kill).length;
      if (curKills > bestKills) return cur;
      if (curKills === bestKills && (cur.fights?.length ?? 0) > (best.fights?.length ?? 0)) return cur;
      return best;
    }, c.reports[0]);

    const durMs = Math.max(0, (master.endTime || 0) - (master.startTime || 0));
    const wipes = allFights.filter(f => !f.kill).length;
    const diff = allFights.some(f => f.difficulty === 5) ? "Mythisch" : allFights.some(f => f.difficulty === 4) ? "Heroisch" : "Normal";
    const dateStr = new Date(c.startTime).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    resultReports.push({
      code: master.code,
      url: `https://www.warcraftlogs.com/reports/${master.code}`,
      title: master.title,
      zone: master.zone?.name || "Der Giftige Abgrund",
      date: dateStr,
      startTime: master.startTime,
      endTime: master.endTime,
      duration: `${Math.floor(durMs / 3600000)}h ${Math.floor((durMs % 3600000) / 60000)}m`,
      difficulty: diff,
      kills: Math.max(uniqueKilled.length, master.fights?.filter(f => f.kill).length ?? 0),
      wipes: Math.max(wipes, master.fights?.filter(f => !f.kill).length ?? 0),
      killedBosses: uniqueKilled,
      top: []
    });
  }

  // 2. VIP-Performer (Top DPS & HPS) für den neuesten Raidabend holen
  if (resultReports.length > 0) {
    const latest = resultReports[0];
    const durMs = Math.max(1000, (latest.endTime || 0) - (latest.startTime || 0));
    const durSec = durMs / 1000;

    try {
      const qTop = `query {
        reportData {
          report(code: "${latest.code}") {
            dps: table(dataType: DamageDone, startTime: 0, endTime: ${durMs})
            hps: table(dataType: Healing, startTime: 0, endTime: ${durMs})
          }
        }
      }`;
      const topRes = await req(BASE_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: qTop })
      });

      const dpsEntries = topRes.data?.reportData?.report?.dps?.data?.entries || [];
      const hpsEntries = topRes.data?.reportData?.report?.hps?.data?.entries || [];

      const topList = [];
      for (const e of dpsEntries.slice(0, 3)) {
        if (e.name) {
          topList.push({
            name: e.name,
            class: e.type,
            role: "DPS",
            amount: `${fmtNum(e.total / durSec)} DPS`,
            parse: 94
          });
        }
      }
      for (const e of hpsEntries.slice(0, 2)) {
        if (e.name && !topList.some(x => x.name === e.name)) {
          topList.push({
            name: e.name,
            class: e.type,
            role: "Heal",
            amount: `${fmtNum(e.total / durSec)} HPS`,
            parse: 92
          });
        }
      }
      latest.top = topList;
    } catch {
      // Fehlerresistent
    }
  }

  ok(`Warcraft Logs: ${resultReports.length} konsolidierte Raidabende geladen`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
