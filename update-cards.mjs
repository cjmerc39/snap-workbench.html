// Snap Workbench: fetch the community card feed, slim it, write cards.json
// Pass 1: the feed (has everything except release dates)
// Pass 2: for status=unreleased cards, read the release date from each card page
const fs = (await import(`node:fs`)).default;

const UP = `https://marvelsnapzone.com/getinfo/?searchtype=cards&searchcardstype=true`;
const SER = { [`pool-1`]:`1`, [`pool-2`]:`2`, [`pool-3`]:`3`, [`pool-4`]:`4`, [`pool-5`]:`5`, [`starter-card`]:`Base`, [`recruit-season`]:`Base` };
const strip = s => String(s || ``).replace(/<[^>]*>/g, ``).replace(/&amp;/g, `&`).replace(/&nbsp;/g, ` `).trim();
const sleep = ms => new Promise(res => setTimeout(res, ms));
const nowSec = Date.now() / 1000;
const UA = { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } };

const slim = c => {
  const name = strip(c.name);
  const m = /pool-(\d)/.exec(c.source_slug || ``);
  const card = { n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability), s: SER[c.source_slug] || (m ? m[1] : `?`) };
  if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, ``);
  if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
  return card;
};

const r = await fetch(UP, UA);
if (!r.ok) { console.error(`upstream returned`, r.status); process.exit(1); }
const j = await r.json();
const raw = (j.success && j.success.cards) || [];
const seen = new Set();
const out = [];
const pending = [];
for (const c of raw) {
  if (c.type !== `Character`) continue;
  const name = strip(c.name);
  if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
  if (name.includes(` - `)) continue;          // Team Clash duplicates like Vision - Avengers
  if (name.endsWith(` Champion`)) continue;    // Sanctum Showdown duplicates like Ghost-Spider Champion
  seen.add(c.carddefid);
  if (c.status === `released`) { out.push(slim(c)); continue; }
  if (c.url && /^https?:\/\//.test(c.url)) pending.push(c);  // unreleased: needs a date check
}

console.log(`pass 1:`, out.length, `released,`, pending.length, `unreleased to date-check`);
const recent = [];
for (const c of pending.slice(0, 80)) {
  await sleep(300);
  let rel = 0;
  try {
    const page = await fetch(c.url, UA);
    if (page.ok) {
      const text = (await page.text()).replace(/<[^>]*>/g, ` `).replace(/&[a-z]+;/g, ` `);
      const m = /Release Date[^A-Za-z]{0,40}([A-Z][a-z]{2,9} \d{1,2}, \d{4})/.exec(text);
      if (m) { const t = Date.parse(m[1]); if (Number.isFinite(t)) rel = t / 1000; }
    }
  } catch (e) { /* page unreachable: treat as no date */ }
  const name = strip(c.name);
  if (!rel) { console.log(`NO-DATE >>>`, name, `(left out; tell Claude if this card is actually playable)`); continue; }
  if (rel <= nowSec + 43200) {
    out.push(slim(c));
    console.log(`EVENT-RELEASED >>>`, name, `(` + new Date(rel * 1000).toISOString().slice(0, 10) + `)`);
    recent.push(name);
  } else {
    console.log(`FUTURE >>>`, name, `(` + new Date(rel * 1000).toISOString().slice(0, 10) + `)`);
  }
}

if (out.length < 200) { console.error(`sanity check failed: only`, out.length, `cards, not writing`); process.exit(1); }
out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));
fs.writeFileSync(`cards.json`, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cards: out }));
console.log(`wrote`, out.length, `cards;`, recent.length, `via event-release dates`);
