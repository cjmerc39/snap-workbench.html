// Dev-only: screenshots the Library hub + sub-pages. node shot-lib.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-lib';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8795, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8795/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await page.evaluate(() => {
  S.cardChanges = [
    { at:'2026-07-16', d:'Hulk', n:'Hulk', ch:[{k:'p',from:12,to:11}] },
    { at:'2026-07-16', d:'Wong', n:'Wong', ch:[{k:'a',from:'x',to:'y'}] },
    { at:'2026-07-10', d:'Beast', n:'Beast', ch:[{k:'c',from:3,to:2},{k:'p',from:5,to:4}] },
  ];
  renderOtaHistory(); setTab('collection'); setLibPage('home');
});
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/l1-hub.png' });
await page.evaluate(() => setLibPage('ota'));
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/l2-ota.png' });
await page.evaluate(() => setLibPage('cards'));
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('main').scrollBy(0, 600));
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/l3-cards-scrolled.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
