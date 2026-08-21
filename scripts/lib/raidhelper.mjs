/* Raid-Helper — Events und Signups aus eurem Discord.
   Holt Events über die IDs aus content/termine.json
   sowie über den Server-Endpunkt. */
import { req, pool, ok } from "./util.mjs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://raid-helper.dev/api";

async function getTermineIds() {
  try {
    const raw = await readFile(join(ROOT, "content", "termine.json"), "utf8");
    const j = JSON.parse(raw);
    return (j.termine ?? [])
      .map(t => t.id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function events({ apiKey, serverId, limit = 8 }) {
  const explicitIds = await getTermineIds();
  let eventIds = [...explicitIds];

  if (apiKey && serverId) {
    try {
      const list = await req(`${BASE}/v2/servers/${serverId}/events`, {
        headers: { Authorization: apiKey, serverid: serverId }
      });
      const posted = (list.postedEvents ?? list.events ?? [])
        .map(e => e.id ?? e.eventId ?? e.messageId)
        .filter(Boolean);
      for (const id of posted) {
        if (!eventIds.includes(id)) eventIds.push(id);
      }
    } catch {
      // Fallback: nutzt direkt die IDs aus content/termine.json
    }
  }

  const idsToFetch = eventIds.slice(0, limit);

  const full = await pool(idsToFetch, 3, async (id) => {
    try {
      const ev = await req(`${BASE}/event/${id}`, {}, 2);
      if (!ev || ev.reason === "unknown event") return null;

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
        id: String(id),
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
    } catch {
      return null;
    }
  });

  const res = full.filter(Boolean);
  ok(`Raid-Helper: ${res.length} Termine geladen`);
  return { events: res, updatedAt: new Date().toISOString() };
}
