/* Discord OAuth2 — Token-Tausch, Nutzerdaten, Gilden-Mitgliedschaft. */

const API = "https://discord.com/api/v10";

export function authorizeUrl({ clientId, redirectUri, state }) {
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "identify guilds.members.read");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "none");
  return u.toString();
}

export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) throw new Error(`Discord Token-Tausch fehlgeschlagen: HTTP ${res.status}`);
  return res.json();
}

export async function fetchUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Discord /users/@me fehlgeschlagen: HTTP ${res.status}`);
  return res.json();
}

/** Wirft nicht bei 404 — gibt stattdessen null zurück (kein Gildenmitglied). */
export async function fetchGuildMember(accessToken, guildId) {
  const res = await fetch(`${API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Discord Gildenmitgliedschaft-Check fehlgeschlagen: HTTP ${res.status}`);
  return res.json();
}
