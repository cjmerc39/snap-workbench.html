// Dev-only: screenshots the Saved > Creator segment (zone preview fallback). node shot-creator.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-creator';
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  const f = path.join(process.cwd(), p);
  try { const b = fs.readFileSync(f); res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8792, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8792/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// one decoded deck + one zone link-out (image fallback) + one snap.fan link-out
await page.evaluate(() => {
  S.creatorDecks = [
    { creator:'Snap Judgments', video:'The Perfect 12! Thanos Destroy is FINALLY Meta!', url:'https://youtu.be/x', published:'2026-07-15',
      name:'Toxicsoulking', ids:[], zone:'https://marvelsnapzone.com/decks/toxicsoulking32c870a/' },
    { creator:'Snap Judgments', video:'The Perfect 12! Thanos Destroy is FINALLY Meta!', url:'https://youtu.be/x', published:'2026-07-15',
      name:'Monkey Boomerang', ids:[], zone:'https://marvelsnapzone.com/decks/monkey-boomerang/' },
  ];
  setTab('saved');
  document.querySelector('#savedseg [data-seg="creator"]').click();
});
await page.waitForTimeout(4000); // let the preview webp load
await page.screenshot({ path: OUT + '/c1-zone-preview.png' });
await page.evaluate(() => { const r = document.querySelector('#creatorlist .crow'); if (r) r.scrollIntoView({ block: 'start' }); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/c2-zone-preview-row.png' });
await browser.close();
server.close();
console.log('shots written to ' + OUT);
