/* WoWAudit — Team-API-Key. Liefert kuratiertes Roster, Anwesenheit, Wishlists.
   ACHTUNG: Der Key erlaubt auch Schreibzugriffe. Niemals ins Frontend! */
import { req, ok, fail } from "./util.mjs";

const BASE = "https://wowaudit.com/v1";

const get = (key, path) =>
  req(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}` } }, 2);

export async function team({ apiKey }) {
  const out = { characters: [], attendance: null, updatedAt: new Date().toISOString() };

  const chars = await get(apiKey, "/characters");
  out.characters = (Array.isArray(chars) ? chars : chars?.characters ?? []).map(c => ({
    id: c.id, name: c.name, realm: c.realm, cls: c.class,
    role: c.role, rank: c.rank, status: c.status,
    blizzardId: c.blizzard_id ?? null,
    // Die folgenden Felder liefert WoWAudit je nach Tarif/Konfiguration —
    // wir übernehmen sie, wenn sie da sind, und lassen sie sonst leer.
    ilvl: c.item_level ?? c.equipped_item_level ?? null,
    vault: c.vault ?? c.great_vault ?? null,
    wishlist: c.wishlist ?? null
  }));
  ok(`WoWAudit: ${out.characters.length} Charaktere geladen`);

  try {
    out.attendance = await get(apiKey, "/attendance");
    ok("WoWAudit: Anwesenheit geladen");
  } catch (e) {
    fail(`WoWAudit: Anwesenheit nicht verfügbar (${e.message.split("—")[0].trim()})`);
  }
  return out;
}
