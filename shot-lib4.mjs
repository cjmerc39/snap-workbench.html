// Dev-only: screenshots the accordion Archetype guide + batched Variant gallery. node shot-lib4.mjs [outdir]
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
await new Promise(r => server.listen(8797, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8797/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Archetype guide: collapsed accordion + chips
await page.evaluate(() => { setTab('collection'); setLibPage('arc'); });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/p1-arch-collapsed.png' });

// open one section via its header
await page.evaluate(() => { document.querySelectorAll('#arclist .arc-head')[0].click(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/p2-arch-open.png' });

// jump via a chip to a later section
await page.evaluate(() => { const c = document.querySelectorAll('#arclist .arc-chip'); c[c.length - 1].click(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/p3-arch-chipjump.png' });

// Variant gallery: first batch
await page.evaluate(() => setLibPage('var'));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/p4-var-top.png' });
console.log('cells after load:', await page.evaluate(() => document.querySelectorAll('#varlist .var-cell').length));

// scroll to the bottom repeatedly so the sentinel pulls every batch in
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; });
  await page.waitForTimeout(500);
}
const n = await page.evaluate(() => ({ cells: document.querySelectorAll('#varlist .var-cell').length, total: (S.varList || []).length, sentinelHidden: document.querySelector('#varlist .var-more').hidden }));
console.log('after scrolling:', JSON.stringify(n));
await page.screenshot({ path: OUT + '/p5-var-bottom.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
