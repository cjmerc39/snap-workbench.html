// One-time backfill: stamp a release date (r: 'YYYY-MM-DD') on every card in
// cards.json that lacks one, scraped from each card's snap.fan page ("Released"
// row). snap.fan is already this repo's authority for release dates (see
// update-cards.mjs, which reads their schedule); this reaches the back catalog
// the forward-looking schedule can't. Run once, locally: node backfill-dates.mjs
// Going forward update-cards.mjs stamps new cards itself — this never re-runs.
const fs = (await import(`node:fs`)).default;

const UA = { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } };
const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseReleased(html){
  const m = /Released[\s\S]{0,500}?title="([^"]+)"/.exec(html);
  if (!m) return null;
  // Django-style: "Dec. 7, 2022, 7 p.m." / "March 14, 2023, ..." / "Sept. 5, 2024"
  const d = /^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/.exec(m[1].trim());
  if (!d) return null;
  const mo = MONTHS[d[1].slice(0, 3).toLowerCase()];
  if (mo == null) return null;
  const iso = new Date(Date.UTC(+d[3], mo, +d[2])).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

const j = JSON.parse(fs.readFileSync(`cards.json`, `utf8`));
const need = j.cards.filter(c => !c.r);
console.log(j.cards.length, `cards,`, need.length, `missing a release date`);
let hit = 0, miss = [];
for (const c of need) {
  await sleep(120);
  try {
    const r = await fetch(`https://snap.fan/cards/` + encodeURIComponent(c.d) + `/`, UA);
    if (!r.ok) { miss.push(c.d + ` (http ` + r.status + `)`); continue; }
    const iso = parseReleased(await r.text());
    if (!iso) { miss.push(c.d + ` (no date on page)`); continue; }
    c.r = iso; hit++;
    if (hit % 40 === 0) console.log(`…`, hit, `dated so far`);
  } catch (e) { miss.push(c.d + ` (` + (e && e.message) + `)`); }
}
console.log(`dated`, hit, `cards;`, miss.length, `misses`);
if (miss.length) console.log(`missed:`, miss.join(`, `));
// refuse a uselessly thin result — a snap.fan outage shouldn't write a half-dated file
if (hit + (j.cards.length - need.length) < j.cards.length * 0.7) {
  console.error(`under 70% coverage — not writing`);
  process.exit(1);
}
fs.writeFileSync(`cards.json`, JSON.stringify(j));
console.log(`wrote cards.json`);
