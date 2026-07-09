// Snap Workbench: build cards.json from two sources
//   1) marvelsnapzone feed: card data (cost/power/text/art) but unreliable status for event releases
//   2) snap.fan schedule: authoritative release dates keyed by CardDefId
const fs = (await import(`node:fs`)).default;

const FEED = `https://marvelsnapzone.com/getinfo/?searchtype=cards&searchcardstype=true`;
const SCHED = `https://snap.fan/news/schedule/`;
const SER = { [`pool-1`]:`1`, [`pool-2`]:`2`, [`pool-3`]:`3`, [`pool-4`]:`4`, [`pool-5`]:`5`, [`starter-card`]:`Base`, [`recruit-season`]:`Base` };
const strip = s => String(s || ``).replace(/<[^>]*>/g, ``).replace(/&amp;/g, `&`).replace(/&nbsp;/g, ` `).trim();
const UA = { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } };
const nowMs = Date.now();
const DAY = 86400000;

// ---- source 2: schedule -> earliest release date per CardDefId ----
const schedResp = await fetch(SCHED, UA);
if (!schedResp.ok) { console.error(`schedule fetch returned`, schedResp.status); process.exit(1); }
const schedHtml = await schedResp.text();
const dates = {}; // defid -> ms
{
  const rx = /href=["'](?:https?:\/\/snap\.fan)?\/cards\/([A-Za-z0-9]+)\/["']|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?[ ](\d{1,2})(?:,[ ]?(\d{4}))?\b|\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
  const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  let cursor = 0;
  let match;
  while ((match = rx.exec(schedHtml)) !== null) {
    if (match[1]) {                                   // a card link under the current date
      if (cursor && (!dates[match[1]] || cursor < dates[match[1]])) dates[match[1]] = cursor;
    } else if (match[2]) {                            // "Jul 6" or "Jul 6, 2026"
      const y = match[4] ? +match[4] : new Date(nowMs).getFullYear();
      let t = new Date(y, MONTHS[match[2]], +match[3]).getTime();
      if (!match[4]) {                                 // infer year for bare dates
        if (t < nowMs - 200 * DAY) t += 365 * DAY;
        if (t > nowMs + 300 * DAY) t -= 365 * DAY;
      }
      cursor = t;
    } else if (match[5]) {                            // "07/01/2026"
      cursor = new Date(+match[7], +match[5] - 1, +match[6]).getTime();
    }
  }
}
console.log(`schedule: dates for`, Object.keys(dates).length, `card ids`);

// ---- source 1: the feed ----
const r = await fetch(FEED, UA);
if (!r.ok) { console.error(`feed returned`, r.status); process.exit(1); }
const j = await r.json();
const raw = (j.success && j.success.cards) || [];
const seen = new Set();
const out = [];
const recent = [];
const future = [];
let unscheduled = 0;

const slim = c => {
  const name = strip(c.name);
  const m = /pool-(\d)/.exec(c.source_slug || ``);
  const card = { n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability), s: SER[c.source_slug] || (m ? m[1] : `?`) };
  if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, ``);
  if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
  return card;
};

for (const c of raw) {
  if (c.type !== `Character`) continue;
  const name = strip(c.name);
  if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
  if (name.includes(` - `)) continue;          // Team Clash duplicates like Vision - Avengers
  if (name.endsWith(` Champion`)) continue;    // Sanctum Showdown duplicates like Ghost-Spider Champion
  seen.add(c.carddefid);
  if (c.status === `released`) { out.push(slim(c)); continue; }
  const rel = dates[c.carddefid] || 0;
  if (!rel) { unscheduled++; continue; }       // tokens and never-scheduled entries
  if (rel <= nowMs + 12 * 3600000) {
    out.push(slim(c));
    recent.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
  } else {
    future.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
  }
}

if (out.length < 200) { console.error(`sanity check failed: only`, out.length, `cards, not writing`); process.exit(1); }
out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));
fs.writeFileSync(`cards.json`, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cards: out }));
console.log(`wrote`, out.length, `cards`);
console.log(`EVENT-RELEASED via schedule:`, recent.length ? recent.join(`, `) : `(none)`);
console.log(`FUTURE (auto-include on their day):`, future.length ? future.join(`, `) : `(none)`);
console.log(`skipped`, unscheduled, `unreleased-and-unscheduled entries (tokens etc.)`);
