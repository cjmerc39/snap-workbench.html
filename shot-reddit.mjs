// Dev-only: screenshots the Saved > Reddit segment controls (sort/filter/freshness). node shot-reddit.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-lib4';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8798, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8798/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1: default view — sort toggle (Top this week on), sub chips, freshness row
await page.evaluate(() => { setTab('saved'); document.querySelector('#savedseg [data-seg="reddit"]').click(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/r1-default.png' });

// 2: Newest sort active
await page.evaluate(() => { [...document.querySelectorAll('#redditlist .rsort .chip')].find(c => c.textContent === 'Newest').click(); });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/r2-newest.png' });

// 3: an empty sub selected — chips stay visible with the "no decks" message
await page.evaluate(() => {
  [...document.querySelectorAll('#redditlist .rsort .chip')].find(c => c.textContent === 'Top this week').click();
  S.creatorDecks = S.creatorDecks.filter(cd => cd.creator !== 'r/MarvelSnapComp');   // display-only: guarantee the empty state
  [...document.querySelectorAll('#redditlist .rsubs .chip')].find(c => c.textContent === 'r/MarvelSnapComp').click();
});
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/r3-empty-sub.png' });

// 4: refresh tapped — toast reports whether anything new arrived
await page.evaluate(() => { [...document.querySelectorAll('#redditlist .rsubs .chip')].find(c => c.textContent === 'All').click(); });
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('#redditlist .cr-fresh .abtn').click());
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/r4-refresh-toast.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
