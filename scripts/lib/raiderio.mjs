/* Raider.IO — braucht keinen API-Key.
   Achtung: der fields-Parameter darf NICHT url-kodiert werden,
   sonst liefert Raider.IO stillschweigend nur das Basisprofil. */
import { req, pool, ok, log, fail, sleep } from "./util.mjs";

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
    name: g.name,
    faction: g.faction,
    realm: g.realm,
    region: g.region,
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
  const reg = encodeURIComponent(String(region || "eu").toLowerCase());
  const rlm = encodeURIComponent(String(realm || "blackmoore").toLowerCase());
  const errs = [];

  const res = await pool(names, 2, async (n, i) => {
    await sleep(i * 200);
    const cleanName = String(n || "").trim();
    if (!cleanName) return null;

    const url = `${BASE}/characters/profile?region=${reg}&realm=${rlm}`
              + `&name=${encodeURIComponent(cleanName)}`
              + `&fields=gear,mythic_plus_scores_by_season:current`;
    try {
      const c = await req(url, {}, 3);
      if (!c || c.statusCode === 400 || c.error) {
        errs.push(`${cleanName}: Nicht gefunden`);
        return { name: cleanName, ilvl: null, mplus: 0 };
      }
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
    } catch (e) {
      errs.push(`${cleanName}: ${e.message.split("—")[0].trim()}`);
      // Rückfallobjekt statt Absturz, damit der Charakter im Roster bleibt
      return { name: cleanName, ilvl: null, mplus: 0 };
    }
  });

  const found = res.filter(Boolean);
  const withIlvl = found.filter(c => c.ilvl != null);
  ok(`Raider.IO: ${withIlvl.length}/${names.length} Charaktere mit Details geladen`);
  
  if (errs.length > 0) {
    for (const e of errs.slice(0, 4)) log(`   Hinweis — ${e}`);
  }
  return found;
}
