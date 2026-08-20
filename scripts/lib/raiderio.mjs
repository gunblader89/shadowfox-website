/* Raider.IO — braucht keinen API-Key.
   Achtung: der fields-Parameter darf NICHT url-kodiert werden,
   sonst liefert Raider.IO stillschweigend nur das Basisprofil. */
import { req, pool, ok, log } from "./util.mjs";

const BASE = "https://raider.io/api/v1";

export async function guildProfile({ region, realm, name }) {
  const url = `${BASE}/guilds/profile?region=${region}&realm=${realm}`
            + `&name=${encodeURIComponent(name)}`
            + `&fields=raid_progression,raid_rankings,members`;
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

export async function characters(names, { region, realm }) {
  const res = await pool(names, 4, async (n) => {
    const url = `${BASE}/characters/profile?region=${region}&realm=${realm}`
              + `&name=${encodeURIComponent(n)}`
              + `&fields=gear,mythic_plus_scores_by_season:current`;
    const c = await req(url, {}, 2);
    return {
      name: c.name,
      class: c.class,
      spec: c.active_spec_name,
      role: c.active_spec_role,
      ilvl: c.gear?.item_level_equipped ?? null,
      mplus: Math.round(c.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0),
      thumb: c.thumbnail_url ?? null,
      profileUrl: c.profile_url
    };
  });
  const found = res.filter(Boolean);
  ok(`Raider.IO: ${found.length}/${names.length} Charaktere geladen`);
  if (found.length < names.length) {
    const missing = names.filter((n, i) => !res[i]);
    log(`nicht gefunden: ${missing.join(", ")}`);
  }
  return found;
}
