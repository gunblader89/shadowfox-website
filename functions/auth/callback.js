import { exchangeCode, fetchUser, fetchGuildMember } from "../_shared/discord.js";
import { signSession, parseCookies, sessionCookie, SESSION_MAX_AGE } from "../_shared/session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);

  if (!code || !state || state !== cookies.sf_oauth_state) {
    return new Response("Ungueltige oder abgelaufene Anmeldung. Bitte erneut versuchen.", { status: 400 });
  }

  try {
    const redirectUri = `${env.SITE_URL}/auth/callback`;
    const token = await exchangeCode({
      code, redirectUri,
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET
    });

    const member = await fetchGuildMember(token.access_token, env.DISCORD_GUILD_ID);
    if (!member) {
      return new Response("Dieser Discord-Account ist kein Mitglied der Gilde.", { status: 403 });
    }

    const user = await fetchUser(token.access_token);
    const displayName = member.nick || user.global_name || user.username;

    const session = await signSession({
      uid: user.id,
      name: displayName,
      avatar: user.avatar,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
    }, env.SESSION_SECRET);

    return new Response(null, {
      status: 302,
      headers: [
        ["Location", `${env.SITE_URL}/#termine`],
        ["Set-Cookie", sessionCookie(session)],
        ["Set-Cookie", "sf_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"]
      ]
    });
  } catch (e) {
    return new Response(`Discord-Login fehlgeschlagen: ${e.message}`, { status: 500 });
  }
}
