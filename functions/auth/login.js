import { authorizeUrl } from "../_shared/discord.js";

export async function onRequestGet({ request, env }) {
  const state = crypto.randomUUID();
  const redirectUri = `${env.SITE_URL}/auth/callback`;
  const url = authorizeUrl({ clientId: env.DISCORD_CLIENT_ID, redirectUri, state });

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": `sf_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
    }
  });
}
