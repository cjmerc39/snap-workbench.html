// Re-dating pass: stamp/repair the release date (r: 'YYYY-MM-DD') on EVERY card in
// cards.json from its snap.fan card page. Authority is the card HISTORY TABLE row
// (<div class="text-green">Released</div><div>YYYY-MM-DD</div>) — the page's variant
// gallery ALSO says "Released" per variant art, and the first version of this script
// grabbed that, poisoning many dates with variant-art days (Sebastian Shaw taught us).
// Safe to re-run anytime, locally: node backfill-dates.mjs
// Nightly update-cards.mjs preserves whatever this writes (prevR wins forever).
const fs = (await import(`node:fs`)).default;

const UA = { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseReleased(html){
  const m = /class="text-green">Released<\/div>\s*<div>(\d{4}-\d{2}-\d{2})<\/div>/.exec(html);
  return m ? m[1] : null;
}

const j = JSON.parse(fs.readFileSync(`cards.json`, `utf8`));
console.log(j.cards.length, `cards; verifying release dates against snap.fan history tables...`);
let confirmed = 0, fixed = 0, filled = 0;
const miss = [], changes = [];
for (const c of j.cards) {
  await sleep(130);
  try {
    const r = await fetch(`https://snap.fan/cards/` + encodeURIComponent(c.d) + `/`, UA);
    if (!r.ok) { miss.push(c.d + ` (http ` + r.status + `)`); continue; }
    const iso = parseReleased(await r.text());
    if (!iso) { miss.push(c.d + ` (no history-table date)`); continue; }
    if (!c.r) { c.r = iso; filled++; changes.push(c.d + `: (none) -> ` + iso); }
    else if (c.r !== iso) { changes.push(c.d + `: ` + c.r + ` -> ` + iso); c.r = iso; fixed++; }
    else confirmed++;
    if ((confirmed + fixed + filled) % 60 === 0) console.log(`…`, confirmed + fixed + filled, `checked (` + fixed + ` fixed so far)`);
  } catch (e) { miss.push(c.d + ` (` + (e && e.message) + `)`); }
}
console.log(`confirmed:`, confirmed, `| fixed:`, fixed, `| filled:`, filled, `| unreachable:`, miss.length);
if (changes.length) console.log(`changes:\n  ` + changes.join(`\n  `));
if (miss.length) console.log(`missed:`, miss.join(`, `));
// refuse a uselessly thin result — a snap.fan outage shouldn't write a half-verified file
if (confirmed + fixed + filled < j.cards.length * 0.7) {
  console.error(`under 70% coverage — not writing`);
  process.exit(1);
}
fs.writeFileSync(`cards.json`, JSON.stringify(j));
console.log(`wrote cards.json`);
