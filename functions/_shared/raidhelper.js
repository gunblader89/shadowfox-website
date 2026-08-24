/* Schreibender Zugriff auf die Raid-Helper-API (Server-Key).
   Schema gegen den echten Endpunkt verifiziert (GET/POST/PATCH live getestet,
   Template "wowretail2"): className ist entweder eine echte Rollen-Klasse
   (Tank/Melee/Ranged/Healer, hat specs[]) oder eine Pseudo-Klasse
   (Late/Bench/Tentative/Absence, specs[] leer). Es gibt KEIN separates
   status-Feld — "Zugesagt/Unsicher/Abgemeldet" ist schlicht die Klasse
   selbst. specName nur mitschicken, wenn die Klasse Specs hat.
   Der Lese-Endpunkt braucht keine Autorisierung, Schreiben schon. */

const API = "https://raid-helper.xyz/api/v4";

async function req(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = (body && (body.error || body.message || body.reason)) || res.statusText;
      const err = new Error(`Raid-Helper HTTP ${res.status}: ${msg}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

/** Klassenname -> abgeleiteter Anzeige-Status. Alles andere = normale Rollen-Anmeldung. */
export const PSEUDO_STATUS = { Tentative: "tentative", Absence: "absence", Bench: "bench", Late: "late" };
export function statusFor(className) {
  return PSEUDO_STATUS[className] || "primary";
}

/** Rohes Event inkl. signUps[] und classes[] (Klassen/Spec-Vokabular des Templates). */
export async function getEvent(eventId) {
  return req(`${API}/events/${eventId}`);
}

export function findSignup(event, userId) {
  return (event.signUps || []).find(s => String(s.userId) === String(userId)) || null;
}

/** Nur "echte" Rollen-Klassen mit Specs — fuer den Klasse/Spec-Picker bei Erstanmeldung. */
export function pickableClasses(event) {
  return (event.classes || []).filter(c => (c.specs || []).length > 0);
}

export async function createSignup({ eventId, apiKey, userId, className, specName }) {
  const body = { userId, className };
  if (specName) body.specName = specName;
  return req(`${API}/events/${eventId}/signups`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function updateSignup({ eventId, signupId, apiKey, className, specName }) {
  const body = { className };
  if (specName) body.specName = specName;
  return req(`${API}/events/${eventId}/signups/${signupId}`, {
    method: "PATCH",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
