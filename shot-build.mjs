// Dev-only: screenshots the BUILD tab for UX review. node shot-build.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-build';
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(process.cwd(), p);
  try { const b = fs.readFileSync(f); res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8791, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8791/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// a half-built deck (7 cards) — the mid-build state where the tab has to feel good
await page.evaluate(() => {
  const byName = n => (S.db.find(c => c.n.toLowerCase() === n.toLowerCase()) || {}).d;
  const want = ['Sunspot','Psylocke','Wong','White Tiger','Black Panther','Odin','Iron Man'];
  const ids = [...new Set(want.map(byName).filter(Boolean))];
  const d = { id:'demo1', name:'Wong Ball Machine', cards: ids, notes:'', verdict:null, done:false, updated: Date.now() };
  S.decks = S.decks.filter(x => x.id !== 'demo1'); S.decks.unshift(d); S.activeId = 'demo1';
  persistDecks(); renderAll(); setTab('cards');
});
await page.waitForTimeout(2500); // let art load
await page.screenshot({ path: OUT + '/b1-build-default.png' });

// the fit shelf + owned pill row
await page.evaluate(() => { const el = document.querySelector('#fitshelf'); if (el) el.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/b1b-fitshelf.png' });
const shelfEl = await page.$('#fitshelf');
if (shelfEl) await shelfEl.screenshot({ path: OUT + '/b1c-fitshelf-el.png' });

// Newest sort with real dates + NEW pills
await page.evaluate(() => { S.sort = 'new'; renderBrowse(); document.querySelector('main').scrollTo(0, 0); const el = document.querySelector('.viewrow'); if (el) el.scrollIntoView({ block: 'start' }); });
await page.waitForTimeout(2200);
await page.screenshot({ path: OUT + '/b1d-newest-sort.png' });
await page.evaluate(() => { S.sort = 'cost'; renderBrowse(); });

// scroll into the grid a bit
await page.evaluate(() => { document.querySelector('main').scrollBy(0, 500); });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/b2-build-scrolled.png' });

// detail density
await page.evaluate(() => { S.prefs.density = 'det'; renderCards(); document.querySelector('main').scrollTo(0, 0); });
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/b3-detail-density.png' });
await page.evaluate(() => { S.prefs.density = 'cmp'; renderCards(); });

// tap a card -> indeck state (find a visible tile not in deck)
await page.evaluate(() => { document.querySelector('main').scrollTo(0, 0); });
await page.waitForTimeout(800);
const tile = await page.$('#cardlist .tile:not(.indeck)');
if (tile) { await tile.click(); await page.waitForTimeout(400); }
await page.screenshot({ path: OUT + '/b4-after-tap-add.png' });

// card detail sheet
await page.evaluate(() => { const t = document.querySelector('#cardlist .tile .cib, #cardlist .tile .ib'); if (t) t.click(); });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/b5-card-sheet.png' });
await page.evaluate(() => closeModal());

// filter flyout + sort facet
await page.evaluate(() => openFlyout(true));
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/b6-flyout-sort.png' });
await page.evaluate(() => closeFlyout());

// search bar open
await page.evaluate(() => { document.getElementById('btn-search').click(); });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/b7-searchbar.png' });

// deck zone collapsed state
await page.evaluate(() => { setSearchbar(false); const b = document.getElementById('bh-collapse'); if (b) b.click(); });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/b8-deckzone-collapsed.png' });

await page.evaluate(() => { S.decks = S.decks.filter(x => x.id !== 'demo1'); S.activeId = null; persistDecks(); });
await browser.close();
server.close();
console.log('shots written to ' + OUT);
// (appended by R17 review — this file is dev-only)
