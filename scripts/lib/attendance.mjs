/* Anwesenheits-Archiv — Raid-Helper haelt vergangene Events nur eine
   begrenzte Zeit im "postedEvents"-Endpunkt vor (aktuell haeufig nur den
   naechsten anstehenden Termin). Ohne eigene Archivierung waere Anmelde-
   historie also nach jedem Raidabend wieder weg. Deshalb hier bewusst ein
   reines Append/Update-Archiv (nie ein kompletter Reset wie beim
   Season-Zaehler, der genau daran gescheitert ist) - jedes Event wird per ID
   dauerhaft gespeichert, sobald es begonnen hat. */

/* Gleiche Namens-Normalisierung wie normName() im Frontend (index.html) -
   getrennt gehalten, damit dieses Modul unabhaengig bleibt, muss aber
   identisch sein, sonst passen die Keys beim Abgleich im Frontend nicht
   zusammen. */
function normName(s) {
  if (!s) return "";
  return String(s).split("/")[0].split("|")[0].split("-")[0].split("(")[0].trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * @param existing Zuletzt gespeicherter Inhalt von data/attendance.json (oder null)
 * @param events Aktuelle Liste aus raidhelper.events() - { id, title, date, unixtime, signups: [{name, status}] }
 */
export function updateAttendance({ existing, events, now = new Date() }) {
  const data = (existing && typeof existing === "object" && existing.events)
    ? { events: { ...existing.events } }
    : { events: {} };

  const nowSec = now.getTime() / 1000;

  for (const e of events || []) {
    if (!e?.id || !e.unixtime) continue;
    // Nur bereits begonnene Events werten - Signups fuer zukuenftige Termine
    // sind noch keine Anwesenheit, sondern nur eine Absicht, die sich bis
    // zum Raidabend noch aendern kann.
    if (e.unixtime > nowSec) continue;

    const statusByName = {};
    for (const s of e.signups || []) {
      const key = normName(s.name);
      if (!key) continue;
      statusByName[key] = String(s.status || "").toLowerCase() || "unknown";
    }

    data.events[String(e.id)] = {
      title: e.title || "",
      date: e.date || "",
      unixtime: e.unixtime,
      statusByName
    };
  }

  data.updatedAt = now.toISOString();
  return data;
}
