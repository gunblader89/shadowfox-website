/* Raider.IO — Gear, M+ Score & wöchentliche Runs */
import { req, pool, ok, sleep, log } from "./util.mjs";

const BASE = "https://raider.io/api/v1";
const TIMEZONE = "Europe/Berlin";

/** Reset-Wochen-Key (Mittwoch 03:00 Berliner Zeit) - gleiche Logik wie in
    seasontracker.mjs, hier separat gehalten damit dieses Modul unabhaengig bleibt. */
function resetWeekKey(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, weekday: "short", hour: "numeric", hour12: false
  }).formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const hour = Number(parts.hour) % 24;
  let daysSinceWed = (weekdayIdx - 3 + 7) % 7;
  if (daysSinceWed === 0 && hour < 3) daysSinceWed = 7;
  const resetDate = new Date(now.getTime() - daysSinceWed * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(resetDate);
}

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

    const fields = "gear,mythic_plus_scores_by_season:current,mythic_plus_weekly_highest_level_runs";
    const url = `${BASE}/characters/profile?region=${region}&realm=${encodeURIComponent(charRealm)}&name=${encodeURIComponent(charName)}&fields=${fields}`;

    try {
      const c = await req(url, {}, 3);
      if (!c || c.error) return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0 };

      // Raider.IO matcht per Name+Realm - bei Namensueberschneidungen mit
      // einem inaktiven Account (oder falls die Gilde den Charakter selbst
      // seit langem nicht mehr spielt) landet man auf einem seit Monaten
      // nicht neu gecrawlten Profil mit voellig veralteten Werten (z.B.
      // Itemlevel aus einem laengst vergangenen Patch). Solche Profile lieber
      // als "keine aktuellen Daten" behandeln statt falsche Zahlen zu zeigen.
      const crawledAt = c.last_crawled_at ? new Date(c.last_crawled_at) : null;
      const staleDays = crawledAt ? (Date.now() - crawledAt.getTime()) / 86400000 : Infinity;
      if (staleDays > 45) {
        return { name: charName, realm: charRealm, ilvl: null, mplus: 0, weeklyRuns: 0, stale: true };
      }

      // mythic_plus_recent_runs sind die letzten Laeufe ueberhaupt, unabhaengig
      // von der aktuellen ID - das Maximum mit dieser Liste zu bilden liess die
      // Wochenzahl faelschlich "voll" erscheinen, auch direkt nach dem
      // woechentlichen Reset. Nur weekly_highest_level_runs ist tatsaechlich
      // auf die aktuelle ID beschraenkt.
      const weeklyList = Array.isArray(c.mythic_plus_weekly_highest_level_runs) ? c.mythic_plus_weekly_highest_level_runs : [];
      let runCount = weeklyList.length;

      // Wenn das Profil seit dem letzten woechentlichen Reset noch nicht neu
      // gecrawlt wurde, zeigt Raider.IO hier noch die "weekly"-Liste der
      // VORIGEN Woche (nur inhaltlich veraltet, aber als aktuell markiert) -
      // fuehrte dazu, dass Spieler direkt nach dem Reset faelschlich mit
      // voller alter Wochenzahl (z.B. 8/8) angezeigt wurden. Nur Laeufe
      // zaehlen, die nachweislich aus der aktuellen Reset-Woche stammen.
      if (crawledAt && resetWeekKey(crawledAt) !== resetWeekKey(new Date())) {
        runCount = 0;
      }

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
  const stale = found.filter(c => c.stale);
  ok(`Raider.IO: ${withIlvl.length}/${items.length} Charaktere erfolgreich geladen`);
  if (stale.length) log(`  Uebersprungen (Profil seit >45 Tagen nicht neu gecrawlt, vermutlich falscher Namenstreffer): ${stale.map(c => c.name).join(", ")}`);
  return found;
}
