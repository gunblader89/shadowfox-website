import { readSession } from "../_shared/session.js";

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return Response.json({ loggedIn: false });
  return Response.json({ loggedIn: true, uid: session.uid, name: session.name, avatar: session.avatar });
}
