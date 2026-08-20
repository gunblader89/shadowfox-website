/* Kleine Helfer — bewusst ohne externe Abhängigkeiten. */

export const log  = (...a) => console.log("   ", ...a);
export const ok   = (m)   => console.log("\x1b[32m ✓\x1b[0m", m);
export const skip = (m)   => console.log("\x1b[90m ○\x1b[0m", m);
export const fail = (m)   => console.log("\x1b[33m ✕\x1b[0m", m);

/** fetch mit Timeout, Retry und klarer Fehlermeldung. */
export async function req(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
      const res = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: {
          "User-Agent": "ShadowFox-Gildenwebsite/1.0 (+https://github.com)",
          ...(opts.headers ?? {})
        }
      });
      clearTimeout(t);
      if (res.status === 429) {                       // Rate Limit → warten
        const wait = Number(res.headers.get("retry-after") ?? 5) * 1000;
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      const ct = res.headers.get("content-type") ?? "";
      return ct.includes("json") ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Läuft n Aufgaben mit begrenzter Parallelität — schont fremde APIs. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch { out[idx] = null; }
    }
  }));
  return out;
}

export const slug = s => String(s).toLowerCase()
  .replace(/['’]/g, "").replace(/\s+/g, "-");
