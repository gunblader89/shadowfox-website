/* Raider.IO — Gear, Score & Wochenruns (seit Mittwoch-Reset) */
import { req, pool, ok, sleep } from "./util.mjs";

const BASE = "https://raider.io/api/v1";

function countRunsSinceReset(c) {
  const weekly = Array.isArray(c.mythic_plus_weekly_runs) ? c.mythic_plus_weekly_runs : [];
  
  // EU-Reset: Jeder Mittwoch 05:00 UTC (07:00 CEST)
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  let daysSinceWednesday = (currentDay - 3 + 7) % 7;
  if (daysSinceWednesday === 0 && currentHour < 5) daysSinceWednesday = 7;
  
  const lastReset = new Date(now);
  lastReset.setUTCDate(now.getUTCDate() - daysSinceWednesday);
  lastReset.setUTCHours(5, 0, 0, 0);

  const recent = (Array.isArray(c.mythic_plus_recent_runs) ? c.mythic_plus_recent_runs : [])
    .filter(r => new Date(r.completed_at) >= lastReset);

  const runSet = new Set([
    ...weekly.map(r => r.url || `${r.dungeon}-${r.mythic_level}-${r.completed_at}`),
    ...recent.map(r => r.url || `${r.dungeon}-${r.mythic_level}-${r.completed_at}`)
  ]);

  return Math.max(weekly.length, recent.length, runSet.size);
}

export async function guildProfile({ region, realm, name }) {
  const url = `${BASE}/guilds/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=raid_progression,raid_rankings,members`;
  const g = await req(url);

  const classCount = {};
  for (const m of g.members ?? []) classCount[m.class] = (classCount[m.class] ?? 0) + 1;

  ok(`Raider.IO: Gildenprofil geladen (${g.members?.length ?? 0} Mitglieder)`);
  return {
    name: g.name, faction: g.faction, realm: g.realm, region: g.region,
    profileUrl: g.profile_url,
    raidProgression: g.raid_progression ?? {},
    raidRankings: g.raid_rankings ?? {},
    memberCount: g.members?.length ?? 0,
    classCount,
    members: (g.members ?? []).map(m => ({ rank: m.rank, name: m.name, class: m.class })),
    updatedAt: new Date().toISOString()
  };
}

export async function characters(items, { region, realm }) {
  const res = await pool(items, 2, async (item, i) => {
    await sleep(i * 120);
    const charName = typeof item === "string" ? item.trim() : item.name.trim();
    const charRealm = typeof item === "object" && item.realm ? item.realm : realm;

    const url = `${BASE}/characters/profile?region=${region}&realm=${encodeURIComponent(charRealm)}&name=${encodeURIComponent(charName)}&fields=gear,mythic_plus_scores_by_season:current,mythic_plus_weekly_runs,mythic_plus_recent_runs`;
    try {
      const c = await req(url, {}, 3);
      if (!c || c.error) return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0 };
      
      const runs = countRunsSinceReset(c);
      return {
        name: c.name,
        realm: charRealm,
        class: c.class,
        spec: c.active_spec_name,
        role: c.active_spec_role,
        ilvl: c.gear?.item_level_equipped ?? null,
        mplus: Math.round(c.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0),
        weeklyRuns: runs,
        thumb: c.thumbnail_url ?? null,
        profileUrl: c.profile_url
      };
    } catch {
      return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0 };
    }
  });

  const found = res.filter(Boolean);
  const withRuns = found.filter(c => (c.weeklyRuns || 0) > 0);
  ok(`Raider.IO: ${found.length}/${items.length} Charaktere geladen (${withRuns.length} mit M+-Runs diese Woche)`);
  return found;
}
