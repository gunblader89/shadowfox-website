/* Raider.IO — Gear, M+ Score & wöchentliche Runs */
import { req, pool, ok, sleep } from "./util.mjs";

const BASE = "https://raider.io/api/v1";

export async function guildProfile({ region, realm, name }) {
  const reg = encodeURIComponent(String(region || "eu").toLowerCase());
  const rlm = encodeURIComponent(String(realm || "blackmoore").toLowerCase());
  const gName = encodeURIComponent(String(name || "ShadowFox").trim());

  const url = `${BASE}/guilds/profile?region=${reg}&realm=${rlm}&name=${gName}&fields=raid_progression,raid_rankings,members`;
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
    await sleep(i * 100);
    const charName = typeof item === "string" ? item.trim() : item.name.trim();
    const charRealm = typeof item === "object" && item.realm ? item.realm : realm;

    // Valide Raider.IO Felder: gear, mythic_plus_scores_by_season:current, mythic_plus_weekly_highest_level_runs, mythic_plus_recent_runs
    const fields = "gear,mythic_plus_scores_by_season:current,mythic_plus_weekly_highest_level_runs,mythic_plus_recent_runs";
    const url = `${BASE}/characters/profile?region=${region}&realm=${encodeURIComponent(charRealm)}&name=${encodeURIComponent(charName)}&fields=${fields}`;

    try {
      const c = await req(url, {}, 3);
      if (!c || c.error) return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0 };

      const weeklyList = Array.isArray(c.mythic_plus_weekly_highest_level_runs) ? c.mythic_plus_weekly_highest_level_runs : [];
      const recentList = Array.isArray(c.mythic_plus_recent_runs) ? c.mythic_plus_recent_runs : [];
      const runCount = Math.max(weeklyList.length, recentList.length);

      const equippedIlvl = c.gear?.item_level_equipped ?? c.gear?.item_level_total ?? null;

      return {
        name: c.name,
        realm: charRealm,
        class: c.class,
        spec: c.active_spec_name,
        role: c.active_spec_role,
        ilvl: equippedIlvl ? Math.round(equippedIlvl) : null,
        mplus: Math.round(c.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0),
        weeklyRuns: runCount,
        season: c.mythic_plus_scores_by_season?.[0]?.season ?? null,
        thumb: c.thumbnail_url ?? null,
        profileUrl: c.profile_url
      };
    } catch {
      return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0 };
    }
  });

  const found = res.filter(Boolean);
  const withIlvl = found.filter(c => c.ilvl != null);
  ok(`Raider.IO: ${withIlvl.length}/${items.length} Charaktere erfolgreich geladen`);
  return found;
}
