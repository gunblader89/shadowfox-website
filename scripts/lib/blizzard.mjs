/* Blizzard API — Roster & Weekly Keystone Profile */
import { req, pool, ok } from "./util.mjs";

const BASE_OAUTH = "https://oauth.battle.net/token";
const BASE_API = "https://eu.api.blizzard.com";
const TIMEZONE = "Europe/Berlin";

/** Reset-Wochen-Key (Mittwoch 03:00 Berliner Zeit) - gleiche Logik wie in
    raiderio.mjs, hier separat gehalten damit dieses Modul unabhaengig bleibt. */
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
      // Blizzards Mythic-Keystone-Profile-Endpunkt listet die Laeufe dieser
      // Periode (best_runs) - ein Feld "runs" mit allen Versuchen gibt es
      // dort nicht. Lief seit jeher als "0 Charaktere erfasst" durch, weil
      // current_period.runs nie existierte.
      const allRuns = data.current_period?.best_runs ?? [];

      // Blizzards eigenes "current_period" kann kurz nach dem woechentlichen
      // Reset noch einige Zeit die Laeufe der VORIGEN Woche enthalten
      // (serverseitiger Nachlauf beim Periodenwechsel, unabhaengig vom
      // tatsaechlichen Abfragezeitpunkt) - deshalb zusaetzlich jeden Lauf
      // anhand seines echten Abschluss-Zeitstempels gegen unseren eigenen
      // Reset-Zeitpunkt pruefen, statt Blizzards Periodenkennzeichnung blind
      // zu vertrauen. Falls das Zeitstempel-Feld unerwartet fehlt, wird die
      // unveraenderte Liste verwendet (kein schlechteres Verhalten als vorher).
      const currentWeek = resetWeekKey(new Date());
      const hasTimestamps = allRuns.some(r => r.completed_timestamp);
      const runs = hasTimestamps
        ? allRuns.filter(r => r.completed_timestamp && resetWeekKey(new Date(r.completed_timestamp)) === currentWeek)
        : allRuns;
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
      // null statt 0 - ein fehlgeschlagener Request ("unbekannt") darf beim
      // Zusammenfuehren nicht wie ein bestaetigtes "0 Laeufe diese Woche"
      // behandelt werden. Wird unten herausgefiltert.
      return null;
    }
  });

  const found = res.filter(Boolean);
  const active = found.filter(k => k.runsThisWeek > 0);
  ok(`Blizzard: M+-Wochenruns für ${active.length}/${names.length} Charaktere erfasst`);
  return found;
}
