// Snap Workbench: fetch the community card feed, slim it, write cards.json
const fs = (await import(`node:fs`)).default;

const UP = `https://marvelsnapzone.com/getinfo/?searchtype=cards&searchcardstype=true`;
const SER = { [`pool-1`]:`1`, [`pool-2`]:`2`, [`pool-3`]:`3`, [`pool-4`]:`4`, [`pool-5`]:`5`, [`starter-card`]:`Base`, [`recruit-season`]:`Base` };
const strip = s => String(s || ``).replace(/<[^>]*>/g, ``).replace(/&amp;/g, `&`).replace(/&nbsp;/g, ` `).trim();
const nowSec = Date.now() / 1000;
const relOf = c => {
  let t = Number(c.ReleaseDate ?? c.releaseDate ?? c.release_date ?? 0) || 0;
  if (t > 1e12) t = t / 1000; // milliseconds -> seconds
  return t;
};

const r = await fetch(UP, { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } });
if (!r.ok) { console.error(`upstream returned`, r.status); process.exit(1); }
const j = await r.json();
const raw = (j.success && j.success.cards) || [];
const seen = new Set();
const out = [];
const recent = [];
for (const c of raw) {
  if (c.type !== `Character`) continue;
  const name = strip(c.name);
  if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
  if (name.includes(` - `)) continue; // event-mode duplicates like Mantis - Guardians of the Galaxy
  const rel = relOf(c);
  const isOut = (c.status === `released`) || (rel > 0 && rel <= nowSec);
  if (!isOut) continue;                          // truly unreleased
  if (rel > nowSec + 86400) continue;            // dated in the future, regardless of status flag
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
console.log(`released in the last 3 weeks:`, recent.length ? recent.join(`, `) : `(none flagged with recent dates)`);
