/* Warcraft Logs API v2 — OAuth client_credentials, danach GraphQL.
   Das Token gilt ein Jahr; wir holen es trotzdem bei jedem Lauf frisch. */
import { req, ok, log } from "./util.mjs";

const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL   = "https://www.warcraftlogs.com/api/v2/client";

async function token(id, secret) {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!res.ok) throw new Error(`Warcraft Logs Token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

async function gql(tok, query, variables) {
  const data = await req(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  if (data.errors) throw new Error("GraphQL: " + JSON.stringify(data.errors));
  return data.data;
}

const Q_REPORTS = `
query Reports($name: String!, $server: String!, $region: String!, $limit: Int!) {
  reportData {
    reports(guildName: $name, guildServerSlug: $server, guildServerRegion: $region,
            limit: $limit, page: 1) {
      data {
        code title startTime endTime
        zone { id name }
        owner { name }
        fights(killType: Encounters) { id name kill difficulty fightPercentage }
      }
    }
  }
}`;

const Q_LIMIT = `{ rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }`;

const DIFF = { 1: "LFR", 3: "Normal", 4: "Heroisch", 5: "Mythisch" };

export async function reports({ clientId, clientSecret, region, realm, name, limit = 12 }) {
  const tok = await token(clientId, clientSecret);

  try {
    const rl = await gql(tok, Q_LIMIT, {});
    log(`Warcraft Logs Kontingent: ${rl.rateLimitData.pointsSpentThisHour}/${rl.rateLimitData.limitPerHour} Punkte verbraucht`);
  } catch { /* nicht kritisch */ }

  const d = await gql(tok, Q_REPORTS, {
    name, server: realm, region: region.toUpperCase(), limit
  });

  const list = (d.reportData?.reports?.data ?? []).map(r => {
    const fights = r.fights ?? [];
    const kills  = fights.filter(f => f.kill);
    const wipes  = fights.filter(f => !f.kill);
    const best   = wipes.length
      ? Math.min(...wipes.map(f => f.fightPercentage ?? 100))
      : null;
    const diffs = [...new Set(fights.map(f => DIFF[f.difficulty]).filter(Boolean))];
    const mins  = Math.round((r.endTime - r.startTime) / 60000);
    return {
      code: r.code,
      url: `https://www.warcraftlogs.com/reports/${r.code}`,
      title: r.title,
      zone: r.zone?.name ?? "",
      difficulty: diffs.join(" / ") || "—",
      date: new Date(r.startTime).toISOString().slice(0, 10),
      durationMin: mins,
      duration: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`,
      kills: kills.length,
      wipes: wipes.length,
      bestTryPct: best === null ? null : Number(best.toFixed(1)),
      killedBosses: [...new Set(kills.map(f => f.name))]
    };
  });

  ok(`Warcraft Logs: ${list.length} Reports geladen`);
  return { reports: list, updatedAt: new Date().toISOString() };
}
