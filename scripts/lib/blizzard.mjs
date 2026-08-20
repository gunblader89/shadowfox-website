/* Blizzard Battle.net API — echte In-Game-Gildenränge und
   die abgeschlossenen Mythic-Plus-Runs der laufenden Woche.
   Great Vault gibt es hier NICHT — Blizzard bietet dafür keine Schnittstelle. */
import { req, pool, ok, log, slug } from "./util.mjs";

const TOKEN_URL = "https://oauth.battle.net/token";
const host = region => `https://${region}.api.blizzard.com`;

async function token(id, secret) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  if (!res.ok) throw new Error(`Blizzard Token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

export async function guildRoster({ clientId, clientSecret, region, realm, name, locale = "de_DE" }) {
  const tok = await token(clientId, clientSecret);
  const auth = { headers: { Authorization: `Bearer ${tok}` } };

  const url = `${host(region)}/data/wow/guild/${slug(realm)}/${slug(name)}/roster`
            + `?namespace=profile-${region}&locale=${locale}`;
  const r = await req(url, auth);

  const members = (r.members ?? []).map(m => ({
    name: m.character?.name,
    rank: m.rank,
    level: m.character?.level,
    class: m.character?.playable_class?.name ?? null,
    race: m.character?.playable_race?.name ?? null,
    id: m.character?.id
  }));
  ok(`Blizzard: Gildenroster mit ${members.length} Charakteren geladen`);
  return { members, token: tok, updatedAt: new Date().toISOString() };
}

/** Abgeschlossene M+-Runs der laufenden Woche — die Basis für "wer ist aktiv". */
export async function weeklyKeys({ token: tok, region, realm, names, locale = "de_DE" }) {
  const auth = { headers: { Authorization: `Bearer ${tok}` } };

  // Aktuellen Zeitraum (Blizzard-Woche) ermitteln
  let periodStart = 0;
  try {
    const idx = await req(`${host(region)}/data/wow/mythic-keystone/period/index?namespace=dynamic-${region}&locale=${locale}`, auth);
    const cur = idx.current_period?.id;
    const p = await req(`${host(region)}/data/wow/mythic-keystone/period/${cur}?namespace=dynamic-${region}&locale=${locale}`, auth);
    periodStart = p.start_timestamp ?? 0;
    log(`Blizzard: laufende M+-Woche beginnt ${new Date(periodStart).toLocaleString("de-DE")}`);
  } catch {
    periodStart = Date.now() - 7 * 864e5;   // Notfall: letzte 7 Tage
  }

  const res = await pool(names, 4, async (n) => {
    const url = `${host(region)}/profile/wow/character/${slug(realm)}/${encodeURIComponent(n.toLowerCase())}`
              + `/mythic-keystone-profile?namespace=profile-${region}&locale=${locale}`;
    const p = await req(url, auth, 2);
    const seasonUrl = p.current_period?.best_runs ? null : null;
    const runs = (p.current_period?.best_runs ?? [])
      .filter(r => (r.completed_timestamp ?? 0) >= periodStart);
    return {
      name: n,
      runsThisWeek: runs.length,
      bestLevel: runs.length ? Math.max(...runs.map(r => r.keystone_level)) : 0,
      rating: Math.round(p.current_mythic_rating?.rating ?? 0)
    };
  });

  const found = res.filter(Boolean);
  ok(`Blizzard: M+-Wochenruns für ${found.length}/${names.length} Charaktere`);
  return found;
}
