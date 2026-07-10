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
// One-time seed: released via events but absent from the forward-looking schedule.
// Safe to leave forever; the persistence layer below makes future entries automatic.
const SEED = [`AuntMay`, `MaryJane`, `SpiderManBrandNewDay`];

// ---- R7: curated token / summon table (additive keys on cards.json) ----
// Tokens are type=Character + unreleased in the feed exactly like real datamined cards; NO metadata field
// distinguishes them, so this is a hand-maintained allow-list of carddefids (all verified in feed.json).
// {n,d,c,p,a} = same shape as cards[] (no series — tokens aren't collectible). Art is enriched from the
// feed by carddefid below; c/p here are the feed defaults (variable-stat tokens copy their producer in-game).
const TOKENS = [
  { n:`Squirrel`, d:`Squirrel`, c:1, p:1, a:`` },
  { n:`Mjolnir`, d:`Mjolnir`, c:0, p:0, a:`` },
  { n:`Demon`, d:`Demon`, c:1, p:6, a:`` },
  { n:`Sinister Clone`, d:`SinisterClone`, c:2, p:2, a:`` },
  { n:`Rock`, d:`Rock`, c:1, p:0, a:`` },
  { n:`Tiger`, d:`TigerSpirit`, c:5, p:10, a:`` },
  { n:`DoomBot`, d:`DoomBot`, c:6, p:5, a:`` },
  { n:`Drone`, d:`Drone`, c:1, p:2, a:`` },
  { n:`Illusion`, d:`MysterioIllusion`, c:2, p:0, a:`` },
  { n:`The Void`, d:`TheVoid`, c:4, p:-9, a:`` },
  { n:`Broodling`, d:`Broodling`, c:3, p:2, a:`` },
  { n:`Ultron Mind Stone`, d:`UltronMindStone`, c:2, p:2, a:`` },
  { n:`Ultron Power Stone`, d:`UltronPowerStone`, c:2, p:1, a:`` },
  { n:`Ultron Reality Stone`, d:`UltronRealityStone`, c:2, p:1, a:`` },
  { n:`Ultron Soul Stone`, d:`UltronSoulStone`, c:2, p:3, a:`` },
  { n:`Ultron Space Stone`, d:`UltronSpaceStone`, c:2, p:6, a:`` },
  { n:`Ultron Time Stone`, d:`UltronTimeStone`, c:2, p:4, a:`` },
  { n:`Power Stone`, d:`PowerStone`, c:1, p:3, a:`` },
  { n:`Mind Stone`, d:`MindStone`, c:1, p:1, a:`` },
  { n:`Reality Stone`, d:`RealityStone`, c:1, p:2, a:`` },
  { n:`Soul Stone`, d:`SoulStone`, c:1, p:1, a:`` },
  { n:`Space Stone`, d:`SpaceStone`, c:1, p:3, a:`` },
  { n:`Time Stone`, d:`TimeStone`, c:1, p:1, a:`` },
  { n:`Basic Arrow`, d:`BasicArrow`, c:1, p:1, a:`` },
  { n:`Acid Arrow`, d:`AcidArrow`, c:1, p:-2, a:`` },
  { n:`Grapple Arrow`, d:`GrappleArrow`, c:1, p:3, a:`` },
  { n:`Pym Arrow`, d:`PymParticleArrow`, c:1, p:1, a:`` },
  { n:`Yaka Arrow`, d:`YakaArrow`, c:0, p:0, a:`` },
];
// producer carddefid -> [token carddefid(s)] the OWNER can play. Opponent-target creators
// (Korg/Rockslide/MasterMold/White&Black Widow) are deliberately excluded; random pools list the full set.
const LINKS = {
  SquirrelGirl:[`Squirrel`], Thor:[`Mjolnir`], ShadowlandsDaredevil:[`Demon`], Hood:[`Demon`],
  MrSinister:[`SinisterClone`], Rhino:[`Rock`], Debrii:[`Rock`], MoleMan:[`Rock`], Sandstorm:[`Rock`],
  WhiteTiger:[`TigerSpirit`], DrDoom:[`DoomBot`], Ultron:[`Drone`], Mysterio:[`MysterioIllusion`],
  Sentry:[`TheVoid`], Brood:[`Broodling`],
  KateBishop:[`BasicArrow`,`AcidArrow`,`GrappleArrow`,`PymParticleArrow`,`YakaArrow`],
  InfinityUltron:[`UltronMindStone`,`UltronPowerStone`,`UltronRealityStone`,`UltronSoulStone`,`UltronSpaceStone`,`UltronTimeStone`],
  Thanos:[`PowerStone`,`MindStone`,`RealityStone`,`SoulStone`,`SpaceStone`,`TimeStone`],
};

// Offline selfcheck (no network): every LINKS token id must be in TOKENS, every LINKS key non-empty,
// no duplicate token carddefids. Mirrors creator-decks.mjs --selfcheck. Runs BEFORE any fetch.
if (process.argv.includes(`--selfcheck`)) {
  const tokIds = new Set(TOKENS.map(t => t.d));
  let ok = true;
  if (tokIds.size !== TOKENS.length) { console.error(`selfcheck FAIL: duplicate token carddefids`); ok = false; }
  for (const [k, arr] of Object.entries(LINKS)) {
    if (!Array.isArray(arr) || !arr.length) { console.error(`selfcheck FAIL: empty link list for`, k); ok = false; }
    for (const id of (arr || [])) if (!tokIds.has(id)) { console.error(`selfcheck FAIL: link token`, id, `(from`, k, `) not in TOKENS`); ok = false; }
  }
  console.log(ok ? `selfcheck OK (${TOKENS.length} tokens, ${Object.keys(LINKS).length} producers)` : `selfcheck FAILED`);
  process.exit(ok ? 0 : 1);
}

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
    if (match[1]) {
      if (cursor && (!dates[match[1]] || cursor < dates[match[1]])) dates[match[1]] = cursor;
    } else if (match[2]) {
      const y = match[4] ? +match[4] : new Date(nowMs).getFullYear();
      let t = new Date(y, MONTHS[match[2]], +match[3]).getTime();
      if (!match[4]) {
        if (t < nowMs - 200 * DAY) t += 365 * DAY;
        if (t > nowMs + 300 * DAY) t -= 365 * DAY;
      }
      cursor = t;
    } else if (match[5]) {
      cursor = new Date(+match[7], +match[5] - 1, +match[6]).getTime();
    }
  }
}
console.log(`schedule: dates for`, Object.keys(dates).length, `card ids`);

// ---- memory: anything previously published stays published ----
let prevIds = new Set();
let prevTokenCount = 0;
try {
  const prev = JSON.parse(fs.readFileSync(`cards.json`, `utf8`));
  prevIds = new Set((prev.cards || []).map(x => x.d));
  prevTokenCount = Array.isArray(prev.tokens) ? prev.tokens.length : 0;
  console.log(`memory: `, prevIds.size, `cards +`, prevTokenCount, `tokens in previous output`);
} catch (e) { console.log(`memory: no previous cards.json (first run)`); }

// ---- source 1: the feed ----
const r = await fetch(FEED, UA);
if (!r.ok) { console.error(`feed returned`, r.status); process.exit(1); }
const j = await r.json();
const raw = (j.success && j.success.cards) || [];
const seen = new Set();
const out = [];
const recent = [];
const future = [];
const kept = [];
let unscheduled = 0;

const slim = c => {
  const name = strip(c.name);
  const m = /pool-(\d)/.exec(c.source_slug || ``);
  const card = { n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability), s: SER[c.source_slug] || (m ? m[1] : `?`) };
  if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, ``);
  if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
  return card;
};

// R7.1 owner fix: mode-dupe names (Team Clash "X - Team", Sanctum Showdown "X Champion") drop ONLY when a
// base card exists in the feed — Snap now reuses characters with subtitle names for REAL cards too, so an
// unmatched variant is kept (and logged) rather than silently binned.
const baseIds = new Set(raw.filter(x => {
  const n = strip(x.name || ``);
  return x.carddefid && n && x.type === `Character` && !n.includes(` - `) && !n.endsWith(` Champion`);
}).map(x => x.carddefid));
const hasBase = id => { for (const b of baseIds) if (b !== id && id.startsWith(b)) return true; return false; };
const droppedDupes = [];

for (const c of raw) {
  if (c.type !== `Character`) continue;
  const name = strip(c.name);
  if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
  const modeDupe = name.includes(` - `) || name.endsWith(` Champion`);
  if (modeDupe) {
    if (hasBase(c.carddefid)) { droppedDupes.push(c.carddefid); continue; }
    console.log(`KEPT variant-named card (no base card found, so treated as real):`, name, `[` + c.carddefid + `]`);
  }
  seen.add(c.carddefid);
  if (c.status === `released`) { out.push(slim(c)); continue; }
  if (SEED.includes(c.carddefid) || prevIds.has(c.carddefid)) {
    out.push(slim(c));
    kept.push(name);
    continue;
  }
  const rel = dates[c.carddefid] || 0;
  if (!rel) { unscheduled++; continue; }       // tokens and never-scheduled entries
  if (rel <= nowMs + 12 * 3600000) {
    out.push(slim(c));
    recent.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
  } else {
    future.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
  }
}
for (const id of SEED) if (!seen.has(id)) console.log(`SEED MISS >>> no feed entry for`, id, `(check the defid with Claude)`);
console.log(`mode-dupe variants dropped (base card exists):`, droppedDupes.length);

if (out.length < 200) { console.error(`sanity check failed: only`, out.length, `cards, not writing`); process.exit(1); }
out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));

// ---- R7: enrich tokens with feed art + advisory drift scan (curated table stays the source of truth) ----
const feedById = {};
for (const c of raw) if (c.carddefid) feedById[c.carddefid] = c;
const outTokens = TOKENS.map(t => {
  const f = feedById[t.d];
  const tok = { n: t.n, d: t.d, c: +t.c || 0, p: +t.p || 0, a: t.a || `` };
  if (f && f.art && /^https?:\/\//.test(f.art)) tok.i = String(f.art);   // nicer chips when the token has real art
  return tok;
});
const missingArt = outTokens.filter(t => !t.i).map(t => t.d);
if (missingArt.length) console.log(`tokens without feed art:`, missingArt.join(`, `));
// advisory only: does each producer's ability text still mention its token (plural-aware)? Flags scrape drift.
for (const [pid, toks] of Object.entries(LINKS)) {
  const f = feedById[pid];
  if (!f) { console.log(`LINK DRIFT >>> producer`, pid, `absent from feed`); continue; }
  const txt = strip(f.ability).toLowerCase();
  const hit = toks.some(tid => {
    const base = (TOKENS.find(t => t.d === tid) || {}).n || tid;
    const stem = base.toLowerCase().replace(/[^a-z ]/g, ``).split(` `).pop();   // last word, e.g. "stone", "arrow"
    return stem && (txt.includes(stem) || txt.includes(stem + `s`));
  });
  if (!hit) console.log(`LINK DRIFT >>> `, pid, `ability no longer mentions its token(s):`, toks.join(`,`));
}
// token sanity floor (mirror the 200-card floor): refuse to shrink the curated table under a bad edit.
const tokenFloor = Math.max(15, prevTokenCount);
if (outTokens.length < tokenFloor) { console.error(`token sanity check failed: only`, outTokens.length, `tokens (<`, tokenFloor, `), not writing`); process.exit(1); }

fs.writeFileSync(`cards.json`, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cards: out, tokens: outTokens, links: LINKS }));
console.log(`wrote`, out.length, `cards +`, outTokens.length, `tokens /`, Object.keys(LINKS).length, `producers`);
console.log(`EVENT-RELEASED via schedule:`, recent.length ? recent.join(`, `) : `(none)`);
console.log(`KEPT via seed/memory:`, kept.length ? kept.join(`, `) : `(none)`);
console.log(`FUTURE (auto-include on their day):`, future.length ? future.join(`, `) : `(none)`);
console.log(`skipped`, unscheduled, `unreleased-and-unscheduled entries (tokens etc.)`);
