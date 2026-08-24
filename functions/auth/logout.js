import { clearSessionCookie } from "../_shared/session.js";

export async function onRequestGet({ env }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.SITE_URL}/#termine`,
      "Set-Cookie": clearSessionCookie()
    }
  });
}
