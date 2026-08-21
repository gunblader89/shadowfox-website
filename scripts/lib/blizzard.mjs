/* Blizzard API — Roster & Weekly Keystone Profile */
import { req, pool, ok } from "./util.mjs";

const BASE_OAUTH = "https://oauth.battle.net/token";
const BASE_API = "https://eu.api.blizzard.com";

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

export async function guildRoster({ clientId, clientSecret, realm, name }) {
  const tok = await token(clientId, clientSecret);
  const cleanRealm = encodeURIComponent(realm.toLowerCase().replace(/\s+/g, "-"));
  const cleanName = encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"));

  const url = `${BASE_API}/data/wow/guild/${cleanRealm}/${cleanName}/roster?namespace=profile-eu&locale=de_DE`;
  const data = await req(url, { headers: { Authorization: `Bearer ${tok}` } });

  const members = (data.members ?? []).map(m => ({
    name: m.character?.name,
    realm: m.character?.realm?.slug || realm,
    rank: m.rank,
    level: m.character?.level,
    classId: m.character?.playable_class?.id
  }));

  ok(`Blizzard: Gildenroster mit ${members.length} Charakteren geladen`);
  return { token: tok, members, updatedAt: new Date().toISOString() };
}

export async function weeklyKeys({ token, region = "eu", realm = "blackmoore", names = [] }) {
  const res = await pool(names, 4, async (item) => {
    const charName = typeof item === "string" ? item.trim() : item.name.trim();
    const charRealm = typeof item === "object" && item.realm ? item.realm : realm;
    const cleanRealm = encodeURIComponent(charRealm.toLowerCase().replace(/\s+/g, "-"));
    const cleanName = encodeURIComponent(charName.toLowerCase());

    const url = `https://${region}.api.blizzard.com/profile/wow/character/${cleanRealm}/${cleanName}/mythic-keystone-profile?namespace=profile-${region}&locale=de_DE`;
    try {
      const data = await req(url, { headers: { Authorization: `Bearer ${token}` } }, 2);
      const runs = data.current_period?.runs ?? [];
      return {
        name: charName,
        realm: charRealm,
        runsThisWeek: runs.length,
        runs: runs.map(r => ({
          dungeon: r.dungeon?.name,
          level: r.keystone_level,
          timed: r.is_completed_within_time
        }))
      };
    } catch {
      return { name: charName, realm: charRealm, runsThisWeek: 0, runs: [] };
    }
  });

  const found = res.filter(Boolean);
  const active = found.filter(k => k.runsThisWeek > 0);
  ok(`Blizzard: M+-Wochenruns für ${active.length}/${names.length} Charaktere erfasst`);
  return found;
}
