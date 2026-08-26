/* Season-Key-Zaehler — weder Blizzard noch Raider.IO geben eine echte
   Season-Gesamtzahl her (Blizzard nur den aktuellen Reset-Zeitraum, Raider.IO
   maximal die letzten 10 Laeufe). Deshalb wird hier selbst mitgezaehlt: kurz
   nach jedem woechentlichen Reset wird die zuletzt gesehene Wochen-Zahl in
   einen dauerhaften Gesamt-Zaehler "gebankt". Start bei 0 ab dem ersten
   Lauf mit dieser Funktion — keine rueckwirkenden Daten fuer bereits
   vergangene Season-Wochen moeglich, das geben die APIs nicht her. */

const TIMEZONE = "Europe/Berlin";

/** Datums-Key (YYYY-MM-DD) des Beginns der aktuellen Reset-Woche
    (Mittwoch 03:00 in der Gilden-Zeitzone). */
function resetWeekKey(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, weekday: "short", hour: "numeric", hour12: false
  }).formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const hour = Number(parts.hour) % 24;
  let daysSinceWed = (weekdayIdx - 3 + 7) % 7;
  if (daysSinceWed === 0 && hour < 3) daysSinceWed = 7; // vor 3 Uhr am Mittwoch selbst -> zaehlt noch zur Vorwoche
  const resetDate = new Date(now.getTime() - daysSinceWed * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(resetDate);
}

/**
 * @param existing Zuletzt gespeicherter Inhalt von data/season-keys.json (oder null)
 * @param characters Liste von { name, weeklyRuns } - der aktuell beste bekannte Wochenwert je Charakter
 * @param seasonId aktuelle Season-Kennung (z.B. "season-mn-2"), zum Erkennen eines Season-Wechsels
 */
export function updateSeasonTotals({ existing, characters, seasonId, now = new Date() }) {
  const weekKey = resetWeekKey(now);
  // Nur bei zwei tatsaechlich bekannten, unterschiedlichen Season-IDs von
  // einem echten Season-Wechsel ausgehen und die Historie verwerfen. Liefert
  // ein Lauf mal keine Season-ID (z.B. weil kein Charakter gerade Score-Daten
  // fuer die aktuelle Season zurueckgibt), soll das NICHT als Season-Wechsel
  // gewertet werden - sonst geht bei jedem vereinzelten API-Aussetzer die
  // komplette gebankte Historie verloren, obwohl es dieselbe Season ist.
  const seasonChanged = Boolean(existing?.season) && Boolean(seasonId) && existing.season !== seasonId;
  const data = (existing && !seasonChanged)
    ? { ...existing, players: { ...existing.players }, season: existing.season || seasonId }
    : { season: seasonId, startedAt: now.toISOString(), players: {} };

  for (const c of characters) {
    if (!c.name) continue;
    const key = c.name.toLowerCase();
    const prev = data.players[key] || { banked: 0, weekKey, weekCount: 0 };
    let { banked, weekKey: prevWeekKey, weekCount } = prev;
    if (prevWeekKey !== weekKey) {
      banked += weekCount;
      prevWeekKey = weekKey;
      weekCount = 0;
    }
    weekCount = Math.max(weekCount, c.weeklyRuns || 0);
    data.players[key] = { name: c.name, banked, weekKey: prevWeekKey, weekCount, total: banked + weekCount };
  }

  data.weekKey = weekKey;
  data.updatedAt = now.toISOString();
  data.totalThisSeason = Object.values(data.players).reduce((sum, p) => sum + p.total, 0);
  return data;
}
