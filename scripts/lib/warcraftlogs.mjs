/* Warcraft Logs — Reports deduplizieren & VIP-Performer laden */
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

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 12 }) {
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
  
  // 1. Logs nach Kalendertag deduplizieren (bester/längster Report pro Abend gewinnt)
  const byDate = new Map();
  for (const r of rawReports) {
    const d = new Date(r.startTime).toISOString().slice(0, 10);
    const fights = r.fights ?? [];
    const kills = fights.filter(f => f.kill).length;
    const wipes = fights.filter(f => !f.kill).length;
    const durMs = Math.max(0, (r.endTime || 0) - (r.startTime || 0));

    const item = {
      code: r.code,
      url: `https://www.warcraftlogs.com/reports/${r.code}`,
      title: r.title,
      zone: r.zone?.name || "Raid",
      date: d,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: `${Math.floor(durMs / 3600000)}h ${Math.floor((durMs % 3600000) / 60000)}m`,
      difficulty: fights.some(f => f.difficulty === 5) ? "Mythisch" : fights.some(f => f.difficulty === 4) ? "Heroisch" : "Normal",
      kills,
      wipes,
      totalFights: kills + wipes,
      killedBosses: [...new Set(fights.filter(f => f.kill).map(f => f.name))],
      top: []
    };

    const existing = byDate.get(d);
    if (!existing || item.totalFights > existing.totalFights || (item.totalFights === existing.totalFights && item.kills > existing.kills)) {
      // Wenn der andere Report Kills hatte, die hier fehlen, zusammenführen
      if (existing) {
        item.killedBosses = [...new Set([...item.killedBosses, ...existing.killedBosses])];
        item.kills = Math.max(item.kills, item.killedBosses.length);
      }
      byDate.set(d, item);
    }
  }

  const reportsList = Array.from(byDate.values()).sort((a, b) => b.startTime - a.startTime);

  // 2. VIP-Spieler (Top Damage & Healing) für den neuesten Report abrufen
  if (reportsList.length > 0) {
    const latest = reportsList[0];
    try {
      const qTop = `query {
        reportData {
          report(code: "${latest.code}") {
            dps: table(dataType: DamageDone, startTime: 0, endTime: 9999999999999)
            hps: table(dataType: Healing, startTime: 0, endTime: 9999999999999)
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
        if (e.name) topList.push({ name: e.name, class: e.type, role: "DPS", amount: e.total, parse: 90 });
      }
      for (const e of hpsEntries.slice(0, 2)) {
        if (e.name && !topList.some(x => x.name === e.name)) {
          topList.push({ name: e.name, class: e.type, role: "Heal", amount: e.total, parse: 92 });
        }
      }
      latest.top = topList;
    } catch {
      // Fallback bleibt bei leerem VIP-Array statt Dummy-Daten
    }
  }

  ok(`Warcraft Logs: ${reportsList.length} konsolidierte Raidabende geladen`);
  return { reports: reportsList, updatedAt: new Date().toISOString() };
}
