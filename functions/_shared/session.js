/* Signierte, zustandslose Session-Cookies — HMAC-SHA256 über Web Crypto.
   Keine Bibliothek, kein KV-Store: der Cookie selbst ist die Session. */

const COOKIE_NAME = "sf_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function signSession(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [body, sig] = cookieValue.split(".");
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(sig), new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readSession(request, secret) {
  const cookies = parseCookies(request);
  return verifySession(cookies[COOKIE_NAME], secret);
}

export function sessionCookie(value, { maxAge = MAX_AGE } = {}) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export const SESSION_MAX_AGE = MAX_AGE;
