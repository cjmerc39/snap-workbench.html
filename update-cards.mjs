// Snap Workbench: fetch the community card feed, slim it, write cards.json
const fs = (await import(`node:fs`)).default;

const UP = `https://marvelsnapzone.com/getinfo/?searchtype=cards&searchcardstype=true`;
const SER = { [`pool-1`]:`1`, [`pool-2`]:`2`, [`pool-3`]:`3`, [`pool-4`]:`4`, [`pool-5`]:`5`, [`starter-card`]:`Base`, [`recruit-season`]:`Base` };
const strip = s => String(s || ``).replace(/<[^>]*>/g, ``).replace(/&amp;/g, `&`).replace(/&nbsp;/g, ` `).trim();
const nowSec = Date.now() / 1000;
const relOf = c => {
  const v = c.ReleaseDate ?? c.releaseDate ?? c.release_date ?? c.released_at ?? null;
  if (v == null || v === ``) return 0;
  let t = Number(v);
  if (Number.isFinite(t) && t > 0) return t > 1e12 ? t / 1000 : t;   // numeric: s or ms
  t = Date.parse(String(v));                                          // string: ISO or human text
  return Number.isFinite(t) ? t / 1000 : 0;
};
const DIAG = [`tombstone`, `tarantula`, `aunt may`, `mary jane`, `brand new day`];

const r = await fetch(UP, { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } });
if (!r.ok) { console.error(`upstream returned`, r.status); process.exit(1); }
const j = await r.json();
const raw = (j.success && j.success.cards) || [];
const seen = new Set();
const out = [];
const recent = [];
const census = {};
for (const c of raw) {
  const st = String(c.status ?? `(none)`);
  census[st] = (census[st] || 0) + 1;
  const name = strip(c.name);
  const lower = name.toLowerCase();
  if (DIAG.some(dn => lower.includes(dn))) {
    const copy = { ...c }; delete copy.variants;
    console.log(`DIAG >>>`, JSON.stringify(copy));
  }
  if (c.type !== `Character`) continue;
  if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
  if (name.includes(` - `)) continue; // event-mode duplicates
  const rel = relOf(c);
  const isOut = (c.status === `released`) || (rel > 0 && rel <= nowSec);
  if (!isOut) continue;
  if (rel > nowSec + 86400) continue;
  seen.add(c.carddefid);
  const m = /pool-(\d)/.exec(c.source_slug || ``);
  const card = { n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0, a: strip(c.ability), s: SER[c.source_slug] || (m ? m[1] : `?`) };
  if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, ``);
  if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
  out.push(card);
  if (rel && nowSec - rel < 21 * 86400) recent.push(name);
}
if (out.length < 200) { console.error(`sanity check failed: only`, out.length, `cards, not writing`); process.exit(1); }
out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));
fs.writeFileSync(`cards.json`, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), cards: out }));
console.log(`wrote`, out.length, `cards`);
console.log(`status census:`, JSON.stringify(census));
console.log(`released in the last 3 weeks:`, recent.length ? recent.join(`, `) : `(none flagged with recent dates)`);
