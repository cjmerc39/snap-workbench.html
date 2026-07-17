// Dev-only: screenshots custom archetypes + flex slots. node shot-arch.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-arch';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8797, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8797/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await page.evaluate(() => {
  const id = n => (S.db.find(c => c.n === n) || {}).d;
  S.myArches = [
    { id:'a1', name:'Wong Ball', ids:[id('Wong'), id('Odin'), id('Black Panther'), id('White Tiger')].filter(Boolean), note:'Double On Reveals — Panther and Tiger get out of hand.' },
    { id:'a2', name:'Hela Discard', ids:[id('Hela'), id('Blade'), id('Sword Master')].filter(Boolean), note:'Discard the fatties, Hela brings them all back.' },
  ];
  setTab('collection'); setLibPage('arc');
});
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/a1-my-archetypes.png' });

await page.evaluate(() => {
  const byName = n => (S.db.find(c => c.n.toLowerCase() === n.toLowerCase()) || {}).d;
  const want = ['Sunspot','Psylocke','Wong','White Tiger','Black Panther','Odin','Iron Man','Zabu','Hawkeye','Nova','Beast','Hulk'];
  const ids = [...new Set(want.map(byName).filter(Boolean))];
  const dd = { id:'fx1', name:'Wong Ball', cards: ids, flex:[byName('Hawkeye'), byName('Nova'), byName('Beast')], updated: Date.now() };
  S.decks = S.decks.filter(x => x.id !== 'fx1'); S.decks.unshift(dd); S.activeId = 'fx1';
  renderAll(); setTab('cards');
});
await page.waitForTimeout(1800);
await page.screenshot({ path: OUT + '/a2-flex-badges.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
