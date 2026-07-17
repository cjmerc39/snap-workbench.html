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
  // OTA ledger diff: real change detected, whitespace-only text flap ignored, new card ignored
  const _p = [{ n: `A`, d: `A1`, c: 3, p: 5, a: `On Reveal:  gain +2.`, s: `4` }, { n: `B`, d: `B1`, c: 2, p: 2, a: ``, s: `3` }];
  const _n = [{ n: `A`, d: `A1`, c: 2, p: 5, a: `On Reveal: gain +2.`, s: `4` }, { n: `B`, d: `B1`, c: 2, p: 2, a: ``, s: `3` }, { n: `C`, d: `C1`, c: 1, p: 1, a: `x`, s: `5` }];
  const _dx = diffCards(_p, _n);
  if (!(_dx.length === 1 && _dx[0].d === `A1` && _dx[0].ch.length === 1 && _dx[0].ch[0].k === `c` && _dx[0].ch[0].from === 3 && _dx[0].ch[0].to === 2)) {
    console.error(`selfcheck FAIL: diffCards wrong ->`, JSON.stringify(_dx)); ok = false;
  }
  console.log(ok ? `selfcheck OK (${TOKENS.length} tokens, ${Object.keys(LINKS).length} producers, OTA diff sane)` : `selfcheck FAILED`);
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
let prevCards = [];  // full previous card objects — the OTA ledger diffs against these
const prevR = {};   // defid -> 'YYYY-MM-DD': release dates persist across runs (seeded once by backfill-dates.mjs)
try {
  const prev = JSON.parse(fs.readFileSync(`cards.json`, `utf8`));
  prevCards = prev.cards || [];
  prevIds = new Set(prevCards.map(x => x.d));
  for (const x of prevCards) if (x.r) prevR[x.d] = x.r;
  prevTokenCount = Array.isArray(prev.tokens) ? prev.tokens.length : 0;
  console.log(`memory: `, prevIds.size, `cards (`, Object.keys(prevR).length, `dated) +`, prevTokenCount, `tokens in previous output`);
} catch (e) { console.log(`memory: no previous cards.json (first run)`); }

// ---- OTA ledger: what changed on cards that existed yesterday (cost/power/text/series) ----
// Snap balance-patches cards over-the-air constantly; the nightly rewrite silently absorbed
// them. diffCards makes each absorption visible so the app can show a running history.
function diffCards(prevList, nextList) {
  const pm = new Map(prevList.map((c) => [c.d, c]));
  const norm = (s) => String(s || ``).replace(/\s+/g, ` `).trim();
  const out = [];
  for (const c of nextList) {
    const p = pm.get(c.d);
    if (!p) continue;                                  // brand-new card = a release, not a change
    const ch = [];
    if (+p.c !== +c.c) ch.push({ k: `c`, from: +p.c, to: +c.c });
    if (+p.p !== +c.p) ch.push({ k: `p`, from: +p.p, to: +c.p });
    if (norm(p.a) !== norm(c.a)) ch.push({ k: `a`, from: norm(p.a), to: norm(c.a) });
    if (String(p.s || ``) !== String(c.s || ``) && String(p.s || ``) !== `?`)
      ch.push({ k: `s`, from: String(p.s), to: String(c.s) });
    if (ch.length) out.push({ d: c.d, n: c.n, ch });
  }
  return out;
}

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

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const slim = c => {
  const name = strip(c.name);
  const m = /pool-(\d)/.exec(c.source_slug || ``);
  const card = { n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability), s: SER[c.source_slug] || (m ? m[1] : `?`) };
  if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, ``);
  if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
  // release date, powering the app's Newest sort: a previously stamped date is
  // permanent. Only a card entering the file for the FIRST time gets stamped —
  // schedule date if listed, else today (first inclusion IS its release day).
  // An already-published card never takes a schedule date: the schedule also
  // mentions old cards for events/spotlights (Topaz taught us that).
  const r = prevR[c.carddefid] || (prevIds.has(c.carddefid) ? `` : (dates[c.carddefid] ? isoDay(dates[c.carddefid]) : isoDay(nowMs)));
  if (r) card.r = r;
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

// ---- datamines: unreleased cards ride cards.json under an additive `upcoming` key ----
// (scheduled ones carry their release date; the rest are datamined with no date yet).
// They NEVER enter cards[] — the app keeps them out of decks and the coach's pool.
const tokenIds = new Set(TOKENS.map((t) => t.d));
const upcomingOut = [];
const slimUp = (c, relMsVal) => {
  const u = { n: strip(c.name), d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability) };
  if (c.art && /^https?:\/\//.test(c.art)) u.i = String(c.art);
  if (relMsVal) u.rel = isoDay(relMsVal);
  return u;
};

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
  if (!rel) {
    unscheduled++;
    // datamined: unreleased, unscheduled, not a token, and carries real leaked text
    if (!tokenIds.has(c.carddefid) && strip(c.ability)) upcomingOut.push(slimUp(c, 0));
    continue;
  }
  if (rel <= nowMs + 12 * 3600000) {
    out.push(slim(c));
    recent.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
  } else {
    future.push(name + ` (` + new Date(rel).toISOString().slice(0, 10) + `)`);
    upcomingOut.push(slimUp(c, rel));
  }
}
// scheduled first (soonest release on top), then datamined A-Z; capped to keep the json lean
upcomingOut.sort((a, b) => (a.rel && b.rel) ? a.rel.localeCompare(b.rel) : (a.rel ? -1 : b.rel ? 1 : a.n.localeCompare(b.n)));
const upcomingFinal = upcomingOut.slice(0, 80);
for (const id of SEED) if (!seen.has(id)) console.log(`SEED MISS >>> no feed entry for`, id, `(check the defid with Claude)`);
console.log(`mode-dupe variants dropped (base card exists):`, droppedDupes.length);

if (out.length < 200) { console.error(`sanity check failed: only`, out.length, `cards, not writing`); process.exit(1); }
out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));

// ---- R7: enrich tokens with feed art + advisory drift scan (curated table stays the source of truth) ----
const feedById = {};
for (const c of raw) if (c.carddefid) feedById[c.carddefid] = c;
const cleanAb = (s) => { const a = strip(s); return (!a || a === `!none`) ? `` : a; };   // feed uses "!none" for blank
const outTokens = TOKENS.map(t => {
  const f = feedById[t.d];
  const tok = { n: t.n, d: t.d, c: +t.c || 0, p: +t.p || 0, a: t.a || `` };
  if (f) {
    if (f.art && /^https?:\/\//.test(f.art)) tok.i = String(f.art);      // nicer chips when the token has real art
    const ab = cleanAb(f.ability);
    if (ab) tok.a = ab;                                                  // tokens have REAL abilities (stones, arrows, Mjolnir…)
  }
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
// token sanity floor (mirror the 200-card floor): refuse to shrink the shipped token set
// under a bad edit. Checked at write time (below) against curated + codex combined,
// because prevTokenCount includes the auto-discovered codex entries too.
const tokenFloor = Math.max(15, prevTokenCount);

// ---- R12: locations (additive key on cards.json; the app hides the feature when absent) ----
const LOC_FEED = `https://marvelsnapzone.com/getinfo/?searchtype=locations&searchcardstype=true`;
let outLocs = [];
try {
  const lr = await fetch(LOC_FEED, UA);
  if (lr.ok) {
    const lj = await lr.json();
    outLocs = ((lj.success && lj.success.cards) || [])
      .filter(l => l.type === `Location` && l.carddefid && strip(l.name) && l.status === `released`)
      .map(l => {
        const loc = { n: strip(l.name), d: l.carddefid, a: strip(l.ability), r: String(l.rarity_slug || ``) };
        if (l.art && /^https?:\/\//.test(l.art)) loc.i = String(l.art);
        return loc;
      });
    outLocs.sort((a, b) => a.n.localeCompare(b.n));
  } else console.log(`locations feed returned`, lr.status);
} catch (e) { console.log(`locations fetch failed:`, e && e.message); }
// sanity floor mirrors cards/tokens: a broken locations fetch keeps the previous set
if (outLocs.length < 50) {
  try {
    const prevL = JSON.parse(fs.readFileSync(`cards.json`, `utf8`)).locations || [];
    if (prevL.length > outLocs.length) { console.log(`locations: fetch thin (` + outLocs.length + `), keeping previous`, prevL.length); outLocs = prevL; }
  } catch (e) {}
}

// ---- created-cards codex: auto-discover tokens/summons beyond the curated table ----
// Any unreleased entry whose NAME appears in a released card's or location's text is a
// created card (Vibranium <= Vibranium Mines, Symbiote <= Klyntar, Winter Soldier <= Bucky…).
// Display-only: these never join LINKS, so the play-line's owner-playable list is untouched.
const madeBy = {};                    // token defid -> [{n, loc:true?}] — who creates it
const codexTokens = [];
{
  const nameRe = (nm) => new RegExp(`\\b` + nm.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`) + `\\b`, `i`);
  const releasedChars = raw.filter((c) => c.type === `Character` && c.status === `released`);
  const curatedIds = new Set(TOKENS.map((t) => t.d));
  // makers for the CURATED tokens: cards from LINKS + locations that name them
  for (const [pid, toks] of Object.entries(LINKS)) {
    const pf = feedById[pid];
    for (const tid of toks) (madeBy[tid] = madeBy[tid] || []).push({ n: pf ? strip(pf.name) : pid });
  }
  for (const t of TOKENS) {
    const re = nameRe(t.n);
    for (const l of outLocs) if (re.test(l.a)) (madeBy[t.d] = madeBy[t.d] || []).push({ n: l.n, loc: true });
  }
  // discovery pass over everything else that's unreleased
  for (const u of raw) {
    if (u.type !== `Character` || u.status === `released` || !u.carddefid || curatedIds.has(u.carddefid)) continue;
    const nm = strip(u.name);
    if (nm.length < 3 || nm.includes(` - `) || nm.endsWith(` Champion`)) continue;
    const re = nameRe(nm);
    const makers = [];
    for (const c of releasedChars) if (re.test(strip(c.ability))) makers.push({ n: strip(c.name) });
    for (const l of outLocs) if (re.test(l.a)) makers.push({ n: l.n, loc: true });
    if (!makers.length) continue;
    const tok = { n: nm, d: u.carddefid, c: +u.cost || 0, p: +u.power || 0, a: cleanAb(u.ability) };
    if (u.art && /^https?:\/\//.test(u.art)) tok.i = String(u.art);
    codexTokens.push(tok);
    madeBy[u.carddefid] = makers;
  }
  // dedupe maker names per token
  for (const k in madeBy) {
    const seen2 = new Set();
    madeBy[k] = madeBy[k].filter((m) => { const key = (m.loc ? `L:` : `C:`) + m.n; if (seen2.has(key)) return false; seen2.add(key); return true; });
  }
  console.log(`codex: +`, codexTokens.length, `auto-discovered created cards (`, codexTokens.map((t) => t.n).join(`, `), `)`);
}
if (outTokens.length + codexTokens.length < tokenFloor) {
  console.error(`token sanity check failed: only`, outTokens.length + codexTokens.length, `tokens (<`, tokenFloor, `), not writing`);
  process.exit(1);
}
// a discovered created-card is a token, not an upcoming release — keep it off the Data mines page
const codexIds = new Set(codexTokens.map((t) => t.d));
const upcomingClean = upcomingFinal.filter((u) => !codexIds.has(u.d));

fs.writeFileSync(`cards.json`, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cards: out, tokens: outTokens.concat(codexTokens), links: LINKS, madeBy, locations: outLocs, upcoming: upcomingClean }));
console.log(`wrote`, out.length, `cards +`, outTokens.length, `tokens /`, Object.keys(LINKS).length, `producers +`, outLocs.length, `locations +`, upcomingFinal.length, `upcoming (` + upcomingFinal.filter(u => u.rel).length + ` scheduled)`);

// ---- variants.json: every released variant art per shipped card (lazy-loaded by the
// Library's Variants gallery — too big to ride cards.json itself) ----
{
  const shippedIds = new Set(out.map((c) => c.d));
  const vout = {};
  let vTotal = 0;
  for (const c of raw) {
    if (c.type !== `Character` || c.status !== `released` || !shippedIds.has(c.carddefid) || !Array.isArray(c.variants)) continue;
    // keep EVERY variant with real art — the feed's per-variant status lags weeks behind
    // the game, so filtering on it silently dropped hundreds of live variants. Released
    // art sorts first; the rest is tagged u:1 so the gallery can label it "datamined".
    const isRel = (v) => String(v.status || ``).toLowerCase() === `released`;
    const vs = c.variants
      .filter((v) => v && v.art && /^https?:\/\//.test(v.art))
      .sort((x, y) => (isRel(x) ? 0 : 1) - (isRel(y) ? 0 : 1))
      .map((v) => {
        const e = { a: String(v.art) };
        const by = strip(v.sketcher || ``) || strip(v.colorist || ``);
        if (by) e.by = by;
        if (!isRel(v)) e.u = 1;
        return e;
      });
    if (vs.length) { vout[c.carddefid] = vs; vTotal += vs.length; }
  }
  if (vTotal >= 500) {                                  // never clobber to a thin file on a feed hiccup
    fs.writeFileSync(`variants.json`, JSON.stringify(vout));
    console.log(`variants:`, vTotal, `art pieces across`, Object.keys(vout).length, `cards`);
  } else console.log(`variants: fetch thin (`, vTotal, `), keeping previous file`);
}

// ---- OTA ledger write: prepend today's diffs to card-changes.json (capped) ----
{
  const CHOUT = `card-changes.json`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const fresh = prevCards.length ? diffCards(prevCards, out) : [];
  let ledger = [];
  try { ledger = JSON.parse(fs.readFileSync(CHOUT, `utf8`)).changes || []; } catch (e) { /* first run */ }
  // same card re-diffed on a re-run today: replace today's entry instead of duplicating
  const freshIds = new Set(fresh.map((x) => x.d));
  ledger = ledger.filter((x) => !(x.at === todayIso && freshIds.has(x.d)));
  ledger = fresh.map((x) => ({ at: todayIso, ...x })).concat(ledger).slice(0, 400);
  fs.writeFileSync(CHOUT, JSON.stringify({ updated: todayIso, changes: ledger }));
  console.log(`OTA ledger:`, fresh.length, `card change(s) this run;`, ledger.length, `entries kept`);
  if (fresh.length) console.log(`  changed:`, fresh.map((x) => x.n + ` (` + x.ch.map((c) => c.k).join(``) + `)`).join(`, `));
}
console.log(`EVENT-RELEASED via schedule:`, recent.length ? recent.join(`, `) : `(none)`);
console.log(`KEPT via seed/memory:`, kept.length ? kept.join(`, `) : `(none)`);
console.log(`FUTURE (auto-include on their day):`, future.length ? future.join(`, `) : `(none)`);
console.log(`skipped`, unscheduled, `unreleased-and-unscheduled entries (tokens etc.)`);
