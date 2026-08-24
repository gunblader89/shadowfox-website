/* Warcraft Logs — Alle echten Raidabende, dedupliziert & Top-2-DPS/HPS-Parses */
import { req, ok, log } from "./util.mjs";

const BASE_OAUTH = "https://www.warcraftlogs.com/oauth/token";
const BASE_API   = "https://www.warcraftlogs.com/api/v2/client";

async function token(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await req(BASE_OAUTH, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  return res.access_token;
}

// Beide aktuellen Raid-Fluegel dieser Saison. Ein einzelner WCL-Report kann
// beide in einer durchgehenden Logging-Session enthalten (z.B. Abgrund clear,
// danach Grotto) — deshalb wird nicht mehr auf report.zone gefiltert, sondern
// direkt auf die Namen der einzelnen Bosskaempfe (siehe bossNameSet unten).
const DEFAULT_BOSS_NAMES = [
  "Nek'zali the Soulcoiler", "Entombed Sentinels", "Vashnik the Malignant",
  "The Lost Explorers", "Sszorak", "The Twin Fangs", "The Coiled Altar", "Ula'tek",
  "Nymrissa Wavecaller"
];

const normalizeName = s => String(s).split("-")[0].trim().toLowerCase();

/** Stunde (0-23) eines Zeitstempels in der Gilden-Zeitzone — grobe, aber
    dependency-freie Methode ohne Timezone-Bibliothek. */
function hourInTimezone(ts, timeZone) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(ts));
}

export async function reports({ clientId, clientSecret, region = "eu", realm = "blackmoore", name = "ShadowFox", limit = 25, bossNames = DEFAULT_BOSS_NAMES, rosterNames = [], raidHours = [18, 23], timeZone = "Europe/Berlin" }) {
  const bossNameSet = new Set(bossNames.map(n => n.toLowerCase().trim()));
  const rosterSet = new Set(rosterNames.map(normalizeName));
  const tok = await token(clientId, clientSecret);

  // Alle Berichte der Gilde abfragen
  const q = `query {
    reportData {
      reports(guildName: "${name}", guildServerSlug: "${realm}", guildServerRegion: "${region}", limit: ${limit}) {
        data {
          code
          title
          startTime
          endTime
          zone { id name }
          fights(killType: Encounters) {
            id
            name
            difficulty
            kill
            startTime
            endTime
            friendlyPlayers
          }
          masterData {
            actors(type: "Player") { id name }
          }
        }
      }
    }
  }`;

  const res = await req(BASE_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });

  const rawReports = res.data?.reportData?.reports?.data ?? [];
  log(`WCL: ${rawReports.length} Reports insgesamt, ${rosterSet.size} bekannte Kader-Namen`);

  // Nur Fights werten, deren Name zu einem der bekannten Raidbosse (beide
  // Fluegel) passt UND die zeitlich in eure Raidzeiten fallen (grosszuegiges
  // Fenster als Puffer). fight.startTime/endTime sind bei WCL relativ zum
  // jeweiligen Report, deshalb zuerst auf absolute Zeitstempel umrechnen —
  // sonst sind sie beim Zusammenfuehren mehrerer Reports (siehe unten) nicht
  // vergleichbar, und der Stunden-Check braucht die absolute Zeit ohnehin.
  const withRaidFights = rawReports
    .map(r => ({
      ...r,
      raidFights: (r.fights ?? [])
        .map(f => ({ ...f, absStart: r.startTime + f.startTime, absEnd: r.startTime + f.endTime }))
        .filter(f => {
          if (![3, 4, 5].includes(f.difficulty)) return false;
          if (!bossNameSet.has(String(f.name).toLowerCase().trim())) return false;
          const hour = hourInTimezone(f.absStart, timeZone);
          return hour >= raidHours[0] && hour <= raidHours[1];
        })
    }))
    .filter(r => r.raidFights.length > 0);

  // Besetzungs-Check: nur auf die Teilnehmer der tatsaechlichen Raidkaempfe
  // beschraenkt (ueber friendlyPlayers pro Kampf), nicht auf den gesamten
  // Report — der kann bei durchgehendem Logging auch voellig unabhaengige
  // Aktivitaeten (Pugs, andere Tage) mit vielen fremden Teilnehmern enthalten,
  // die sonst die Quote faelschlich verwaessern wuerden.
  const rosterReports = rosterSet.size > 0
    ? withRaidFights.filter(r => {
        const actorMap = new Map((r.masterData?.actors ?? []).map(a => [a.id, a.name]));
        const participantIds = new Set(r.raidFights.flatMap(f => f.friendlyPlayers || []));
        const participantNames = [...participantIds].map(id => actorMap.get(id)).filter(Boolean);
        const matches = participantNames.filter(n => rosterSet.has(normalizeName(n))).length;
        const ratio = participantNames.length ? matches / participantNames.length : 0;
        const accepted = participantNames.length > 0 && ratio >= 0.4;
        log(`  Report ${r.code}: ${matches}/${participantNames.length} Teilnehmer der Raidkaempfe bekannt (${Math.round(ratio * 100)}%) -> ${accepted ? "gewertet" : "ausgeschlossen"}`);
        return accepted;
      })
    : withRaidFights;

  // Zeitfenster-Clustering (9h): mehrere WCL-Reports vom selben Raidabend
  // (z.B. nach einem Disconnect/Neustart des Logs) zu einem Eintrag zusammenfassen,
  // statt denselben Abend mehrfach anzuzeigen.
  const sorted = [...rosterReports].sort((a, b) => b.startTime - a.startTime);
  const clusters = [];
  for (const r of sorted) {
    const match = clusters.find(c => Math.abs(c.startTime - r.startTime) < 9 * 3600 * 1000);
    if (match) match.reports.push(r);
    else clusters.push({ startTime: r.startTime, reports: [r] });
  }

  const diffMap = { 3: "Normal", 4: "Heroisch", 5: "Mythisch" };

  const resultReports = clusters.map(c => {
    const allFights = c.reports.flatMap(r => r.raidFights);
    const kills = allFights.filter(f => f.kill);
    const wipes = allFights.filter(f => !f.kill);
    const uniqueKilled = [...new Set(kills.map(f => f.name))];

    // Repraesentativer Report der Nacht = der mit den meisten echten Kills
    // (i.d.R. der vollstaendige Log, nicht ein abgebrochenes Fragment).
    const master = c.reports.reduce((best, cur) =>
      cur.raidFights.filter(f => f.kill).length > best.raidFights.filter(f => f.kill).length ? cur : best
    , c.reports[0]);

    const firstPull = Math.min(...allFights.map(f => f.absStart));
    const lastPull = Math.max(...allFights.map(f => f.absEnd));
    const durMs = Math.max(0, lastPull - firstPull);
    const hours = Math.floor(durMs / 3600000);
    const mins = Math.floor((durMs % 3600000) / 60000);

    const maxDiff = Math.max(...allFights.map(f => f.difficulty || 3));

    return {
      code: master.code,
      url: `https://www.warcraftlogs.com/reports/${master.code}`,
      title: master.title || master.zone?.name || "Der Giftige Abgrund",
      zone: master.zone?.name || "Der Giftige Abgrund",
      startTime: firstPull,
      endTime: lastPull,
      duration: `${hours > 0 ? hours + 'h ' : ''}${mins}m`,
      difficulty: diffMap[maxDiff] || "Normal",
      kills: uniqueKilled.length,
      wipes: wipes.length,
      killedBosses: uniqueKilled,
      vips: { dps: [], hps: [] }
    };
  }).sort((a, b) => b.startTime - a.startTime);

  // VIP-Parses für den aktuellsten (zusammengefuehrten) Raidabend
  if (resultReports.length > 0) {
    const latest = resultReports[0];

    try {
      const qParses = `query {
        reportData {
          report(code: "${latest.code}") {
            dpsRankings: rankings(playerMetric: dps)
            hpsRankings: rankings(playerMetric: hps)
          }
        }
      }`;

      const pRes = await req(BASE_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: qParses })
      });

      // GraphQL antwortet bei ungueltigen Feldern/Argumenten trotzdem mit HTTP 200 —
      // req() prueft nur den HTTP-Status, deshalb hier zusaetzlich auf "errors" achten,
      // sonst bleiben VIP-Parses bei einem Tippfehler wochenlang unbemerkt leer.
      if (pRes.errors?.length) {
        throw new Error(pRes.errors.map(e => e.message).join("; "));
      }

      const reportData = pRes.data?.reportData?.report;
      const dpsRankData = reportData?.dpsRankings?.data ?? [];
      const hpsRankData = reportData?.hpsRankings?.data ?? [];

      let dpsList = [];
      let hpsList = [];

      // Echte DPS-Parses aus den Kills
      for (const fight of dpsRankData) {
        const bossName = fight.encounter?.name || "Boss";
        for (const ch of fight.roles?.dps?.characters || []) {
          if (ch.name && ch.rankPercent != null) {
            dpsList.push({
              name: ch.name,
              class: ch.class,
              spec: ch.spec || "",
              parse: Math.round(ch.rankPercent),
              boss: bossName
            });
          }
        }
      }

      // Echte HPS-Parses aus den Kills (Heiler)
      for (const fight of hpsRankData) {
        const bossName = fight.encounter?.name || "Boss";
        for (const ch of fight.roles?.healers?.characters || []) {
          if (ch.name && ch.rankPercent != null) {
            hpsList.push({
              name: ch.name,
              class: ch.class,
              spec: ch.spec || "",
              parse: Math.round(ch.rankPercent),
              boss: bossName
            });
          }
        }
      }

      dpsList.sort((a, b) => b.parse - a.parse);
      hpsList.sort((a, b) => b.parse - a.parse);

      // Top 2 DPS (dedupliziert)
      const topDps = [];
      for (const d of dpsList) {
        if (!topDps.some(x => x.name.toLowerCase() === d.name.toLowerCase())) {
          topDps.push(d);
          if (topDps.length === 2) break;
        }
      }

      // Top 2 Heiler (dedupliziert)
      const topHps = [];
      for (const h of hpsList) {
        if (!topHps.some(x => x.name.toLowerCase() === h.name.toLowerCase())) {
          topHps.push(h);
          if (topHps.length === 2) break;
        }
      }

      latest.vips = { dps: topDps, hps: topHps };
    } catch (e) {
      // Fehlertoleranz bei reinen Wipe-Abenden ohne Kills — aber sichtbar bleiben,
      // damit ein echter Fehler (Tippfehler, API-Aenderung) nicht wieder wochenlang
      // unbemerkt bleibt.
      log(`VIP-Parses uebersprungen: ${e.message}`);
    }
  }

  ok(`Warcraft Logs: ${resultReports.length} Raidabende geladen (dedupliziert)`);
  return { reports: resultReports, updatedAt: new Date().toISOString() };
}
