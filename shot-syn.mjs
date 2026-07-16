// Dev-only: screenshots the skip-turn planner state + My-synergies UI. node shot-syn.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-syn';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8793, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8793/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// planner with an auto-sketched line, then skip turn 2
await page.evaluate(() => {
  const byName = n => (S.db.find(c => c.n.toLowerCase() === n.toLowerCase()) || {}).d;
  const want = ['Sunspot','Psylocke','Wong','White Tiger','Black Panther','Odin','Iron Man','Zabu','Hawkeye','Nova','Beast','Hulk'];
  const ids = [...new Set(want.map(byName).filter(Boolean))];
  const dd = { id:'syn1', name:'Wong Ball', cards: ids, updated: Date.now() };
  S.decks = S.decks.filter(x => x.id !== 'syn1'); S.decks.unshift(dd); S.activeId = 'syn1';
  renderAll(); setTab('deck'); setDeckTab('planner');
  const L = autoSketchLine(sortedDeckCards(dd));
  L[1] = [];   // vacate T2 so we can skip it
  mutateActiveLine(dd, lo => { lo.turns = L; lo.skip = [false,true,false,false,false,false]; });
  renderPlanner();
});
await page.waitForTimeout(600);
const plTab = await page.$('#decktabs [data-dtab="planner"]');
if (plTab) await plTab.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/s1-skip-slot.png' });

// picker head with the Skip button
await page.evaluate(() => openPlPicker(4));
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/s2-picker-skip.png' });
await page.evaluate(() => closePlPicker());

// My synergies: seeded row + editor open
await page.evaluate(() => {
  S.mySyns = [{ id:'ms1', ids:[ (S.db.find(c=>c.n==='Wong')||{}).d, (S.db.find(c=>c.n==='Odin')||{}).d, (S.db.find(c=>c.n==='Black Panther')||{}).d ].filter(Boolean), note:'Odin re-triggers Wong-doubled On Reveals — Panther gets huge.' }];
  renderMySyns(); setTab('ai');
  document.querySelector('main').scrollTo(0, 99999);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/s3-mysyns-row.png' });
await page.evaluate(() => { openSynEditor(null); document.getElementById('syn-q').value = 'dead'; document.getElementById('syn-q').dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/s4-syn-editor.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
