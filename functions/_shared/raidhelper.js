/* Schreibender Zugriff auf die Raid-Helper-API (Server-Key).
   Schema gegen den echten Endpunkt verifiziert (GET .../events/EVENTID,
   Template "wowretail2"): jedes Signup traegt className (Tank/Melee/Ranged/
   Healer), specName (z.B. "Unholy") und status (primary/tentative/absence/…).
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
      const msg = (body && (body.message || body.reason)) || res.statusText;
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

/** Rohes Event inkl. signUps[] und classes[] (Klassen/Spec-Vokabular des Templates). */
export async function getEvent(eventId) {
  return req(`${API}/events/${eventId}`);
}

export function findSignup(event, userId) {
  return (event.signUps || []).find(s => String(s.userId) === String(userId)) || null;
}

/** Nur "echte" Rollen-Klassen mit Specs — Late/Bench/Tentative/Absence sind Pseudo-Klassen. */
export function pickableClasses(event) {
  return (event.classes || []).filter(c => (c.specs || []).length > 0);
}

export async function createSignup({ eventId, apiKey, userId, className, specName, status }) {
  return req(`${API}/events/${eventId}/signups`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, className, specName, status: status || "primary" })
  });
}

export async function updateSignup({ eventId, signupId, apiKey, patch }) {
  return req(`${API}/events/${eventId}/signups/${signupId}`, {
    method: "PATCH",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}
