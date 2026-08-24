import { readSession } from "../_shared/session.js";
import { getEvent, findSignup, pickableClasses, createSignup, updateSignup } from "../_shared/raidhelper.js";

const VALID_STATUS = new Set(["primary", "tentative", "absence"]);

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return Response.json({ loggedIn: false }, { status: 401 });

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "eventId fehlt" }, { status: 400 });

  try {
    const event = await getEvent(eventId);
    const mine = findSignup(event, session.uid);
    return Response.json({
      loggedIn: true,
      name: session.name,
      signup: mine ? { className: mine.className, specName: mine.specName, status: mine.status } : null,
      classes: pickableClasses(event).map(c => ({
        name: c.name,
        specs: c.specs.map(s => s.name)
      }))
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function onRequestPost({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return Response.json({ error: "Nicht eingeloggt" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Ungueltiger Request" }, { status: 400 }); }

  const { eventId, className, specName } = body;
  const status = VALID_STATUS.has(body.status) ? body.status : "primary";
  if (!eventId || !className || !specName) {
    return Response.json({ error: "eventId, className und specName sind erforderlich" }, { status: 400 });
  }

  try {
    const event = await getEvent(eventId);

    const valid = pickableClasses(event).some(c => c.name === className && c.specs.some(s => s.name === specName));
    if (!valid) return Response.json({ error: "Unbekannte Klasse/Spezialisierung fuer dieses Event" }, { status: 400 });

    const existing = findSignup(event, session.uid);
    if (existing) {
      await updateSignup({
        eventId, apiKey: env.RAIDHELPER_API_KEY, signupId: existing.id,
        patch: { className, specName, status }
      });
    } else {
      await createSignup({
        eventId, apiKey: env.RAIDHELPER_API_KEY, userId: session.uid,
        className, specName, status
      });
    }

    const fresh = await getEvent(eventId);
    const mine = findSignup(fresh, session.uid);
    return Response.json({
      ok: true,
      signup: mine ? { className: mine.className, specName: mine.specName, status: mine.status } : null
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status === 400 ? 400 : 502 });
  }
}
