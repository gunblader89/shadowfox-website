import { readSession } from "../_shared/session.js";
import { getEvent, findSignup, pickableClasses, createSignup, updateSignup, statusFor } from "../_shared/raidhelper.js";

function toSignupView(raw) {
  if (!raw) return null;
  return { className: raw.className, specName: raw.specName || null, status: statusFor(raw.className) };
}

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return Response.json({ loggedIn: false }, { status: 401 });

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) return Response.json({ error: "eventId fehlt" }, { status: 400 });

  try {
    const event = await getEvent(eventId);
    return Response.json({
      loggedIn: true,
      name: session.name,
      signup: toSignupView(findSignup(event, session.uid)),
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

  const { eventId, className } = body;
  const specName = body.specName || null;
  if (!eventId || !className) {
    return Response.json({ error: "eventId und className sind erforderlich" }, { status: 400 });
  }

  try {
    const event = await getEvent(eventId);

    const cls = (event.classes || []).find(c => c.name === className);
    if (!cls) return Response.json({ error: "Unbekannte Klasse fuer dieses Event" }, { status: 400 });
    const needsSpec = (cls.specs || []).length > 0;
    if (needsSpec && !cls.specs.some(s => s.name === specName)) {
      return Response.json({ error: "Unbekannte Spezialisierung fuer diese Klasse" }, { status: 400 });
    }
    const finalSpec = needsSpec ? specName : null;

    const existing = findSignup(event, session.uid);
    if (existing) {
      await updateSignup({
        eventId, apiKey: env.RAIDHELPER_API_KEY, signupId: existing.id,
        className, specName: finalSpec
      });
    } else {
      await createSignup({
        eventId, apiKey: env.RAIDHELPER_API_KEY, userId: session.uid,
        className, specName: finalSpec
      });
    }

    const fresh = await getEvent(eventId);
    return Response.json({ ok: true, signup: toSignupView(findSignup(fresh, session.uid)) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status === 400 ? 400 : 502 });
  }
}
