/* Raid-Helper — Events und Signups aus eurem Discord.
   Die Event-Liste braucht den Server-API-Key.
   Das einzelne Event ist danach ohne Key abrufbar. */
import { req, pool, ok } from "./util.mjs";

const BASE = "https://raid-helper.dev/api";

export async function events({ apiKey, serverId, limit = 8 }) {
  // Raid-Helper Server-Liste über v2 abfragen
  let list;
  try {
    list = await req(`${BASE}/v2/servers/${serverId}/events`, {
      headers: { Authorization: apiKey, serverid: serverId }
    });
  } catch (err) {
    // Fallback falls v2 fehlschlägt
    list = await req(`${BASE}/v3/servers/${serverId}/events`, {
      headers: { Authorization: apiKey, serverid: serverId }
    });
  }

  const posted = (list.postedEvents ?? list.events ?? [])
    .sort((a, b) => Number(a.startTime ?? a.unixtime ?? 0) - Number(b.startTime ?? b.unixtime ?? 0))
    .slice(0, limit);

  const full = await pool(posted, 3, async (e) => {
    const id = e.id ?? e.eventId ?? e.messageId;
    const ev = await req(`${BASE}/event/${id}`, {}, 2);
    const signups = (ev.signups ?? []).map(s => ({
      name: s.name,
      userId: s.userid,
      cls: s.className ?? s.cClass ?? s.class,
      spec: s.cSpec ?? s.spec,
      role: s.role,
      status: s.status,
      signedUpAt: s.signuptime ?? null
    }));

    const by = (type) => signups.filter(s => {
      const roleStr = String(s.role || "").toLowerCase();
      const clsStr = String(s.cls || "").toLowerCase();
      const statusStr = String(s.status || "").toLowerCase();
      const target = type.toLowerCase();
      return roleStr === target || clsStr === target || statusStr === target;
    }).length;

    return {
      id,
      title: ev.title ?? ev.displayTitle,
      description: ev.description ?? "",
      date: ev.date,
      time: ev.time,
      unixtime: Number(ev.unixtime ?? 0),
      closingTime: ev.closingtime ?? null,
      leader: ev.leadername ?? null,
      channel: ev.channelName ?? null,
      counts: {
        primary: signups.filter(s => !["absence", "bench", "late", "tentative"].includes(String(s.role || s.cls).toLowerCase())).length,
        tentative: by("tentative"),
        bench: by("bench"),
        absence: by("absence"),
        late: by("late")
      },
      signups
    };
  });

  const res = full.filter(Boolean);
  ok(`Raid-Helper: ${res.length} Termine geladen`);
  return { events: res, updatedAt: new Date().toISOString() };
}
