// Dev-only: screenshots Archetypes / Season / Variants pages. node shot-lib3.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-lib3';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8796, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8796/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

await page.evaluate(() => { setTab('collection'); setLibPage('ssn'); });
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/p1-season.png' });

await page.evaluate(() => setLibPage('arc'));
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/p2-archetypes.png' });

await page.evaluate(() => setLibPage('var'));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/p3-variants.png' });
await page.evaluate(() => { const c = document.querySelector('#varlist .var-cell'); if (c) c.click(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/p4-variant-sheet.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
