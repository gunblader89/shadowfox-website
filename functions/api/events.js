import { getEvent, statusFor, pickableClasses, listServerEvents } from "../_shared/raidhelper.js";

const ROLE_ORDER = ["Tank", "Melee", "Ranged", "Healer"];

function summarize(raw) {
  const signups = (raw.signUps || []).map(s => ({
    name: s.name, className: s.className, specName: s.specName || null,
    status: statusFor(s.className)
  }));
  const primary = signups.filter(s => s.status === "primary");

  return {
    id: String(raw.id),
    live: true,
    title: raw.title || raw.displayTitle || "Raid",
    date: raw.date,
    time: raw.time,
    leader: raw.leaderName || null,
    startTime: Number(raw.startTime || 0),
    counts: {
      primary: primary.length,
      tentative: signups.filter(s => s.status === "tentative").length,
      absence: signups.filter(s => s.status === "absence").length,
      bench: signups.filter(s => s.status === "bench").length,
      late: signups.filter(s => s.status === "late").length
    },
    roles: ROLE_ORDER.map(name => ({
      name,
      signups: primary.filter(s => s.className === name).map(s => ({ name: s.name, specName: s.specName }))
    })),
    classes: pickableClasses(raw).map(c => ({ name: c.name, specs: c.specs.map(s => s.name) }))
  };
}

export async function onRequestGet({ request, env }) {
  const ids = new Set();
  const placeholders = [];

  try {
    const res = await env.ASSETS.fetch(new URL("/content/termine.json", request.url));
    const j = await res.json();
    for (const t of (j.termine || [])) {
      if (t.id) ids.add(String(t.id));
      else placeholders.push({ live: false, tag: t.tag, datum: t.datum, zeit: t.zeit, instanz: t.instanz, fokus: t.fokus });
    }
  } catch { /* content/termine.json fehlt oder ist kaputt — nur Auto-Discovery nutzen */ }

  if (env.RAIDHELPER_API_KEY && env.DISCORD_GUILD_ID) {
    try {
      const posted = await listServerEvents({ serverId: env.DISCORD_GUILD_ID, apiKey: env.RAIDHELPER_API_KEY });
      const now = Date.now() / 1000;
      for (const e of posted) {
        const id = e.id ?? e.eventId ?? e.messageId;
        const startTime = Number(e.startTime || 0);
        if (id && startTime >= now - 3600) ids.add(String(id));
      }
    } catch { /* Auto-Discovery uebersprungen — Anmeldungen aus termine.json reichen als Fallback */ }
  }

  const now = Date.now() / 1000;
  const fetched = await Promise.all([...ids].slice(0, 8).map(async id => {
    try { return summarize(await getEvent(id)); } catch { return null; }
  }));

  const events = fetched
    .filter(e => e && (!e.startTime || e.startTime >= now - 3600))
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  return Response.json({ events, placeholders }, { headers: { "Cache-Control": "no-store" } });
}
