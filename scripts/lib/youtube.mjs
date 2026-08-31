/* YouTube — neueste Kill-Videos ueber den oeffentlichen RSS-Feed des Kanals.
   Bewusst KEIN YouTube-Data-API-Key noetig (kein Google-Cloud-Projekt, kein
   Quota-Limit) - der Feed ist oeffentlich und liefert Titel, Datum und
   Thumbnail direkt. Einzige Einschraenkung: er zeigt nur die letzten ~15
   Videos - deshalb werden neue Funde in update.mjs dauerhaft in ein Archiv
   gemerged (reines Append/Update, nie ein kompletter Reset - siehe
   mergeVideos() unten), damit aeltere Videos nicht aus der Historie
   verschwinden, sobald mehr als 15 hochgeladen wurden. */
import { req } from "./util.mjs";

/** Deckt die in RSS-Feeds ueblichen Entity-Faelle ab, ohne einen vollen
    XML-Parser als Abhaengigkeit einzufuehren. */
function decodeXmlEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function tag(chunk, name) {
  const m = chunk.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

function attr(chunk, name, attrName) {
  const m = chunk.match(new RegExp(`<${name}[^>]*\\s${attrName}="([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : "";
}

/* Neu gefundene Videos in das dauerhafte Archiv einmergen - reines
   Append/Update per Video-ID, nie ein kompletter Reset. */
export function mergeVideos({ existing, fetched, now = new Date() }) {
  const videos = (existing && typeof existing === "object" && existing.videos)
    ? { ...existing.videos }
    : {};
  for (const v of fetched || []) {
    if (!v?.id) continue;
    videos[v.id] = v;
  }
  return { videos, updatedAt: now.toISOString() };
}

export async function latestVideos({ channelId }) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml = await req(url, {}, 2);
  if (typeof xml !== "string") return [];

  const entries = xml.split("<entry>").slice(1).map(part => part.split("</entry>")[0]);

  return entries.map(chunk => {
    const id = tag(chunk, "yt:videoId");
    if (!id) return null;
    return {
      id,
      title: tag(chunk, "title"),
      publishedAt: tag(chunk, "published"),
      thumbnail: attr(chunk, "media:thumbnail", "url") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      description: tag(chunk, "media:description"),
      url: `https://www.youtube.com/watch?v=${id}`
    };
  }).filter(Boolean);
}
