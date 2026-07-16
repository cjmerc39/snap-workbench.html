// Dev-only: screenshots the creator manager pop-up + one-liner synergies. node shot-mgr.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2] || 'shots-mgr';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json', '.js':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(process.cwd(), p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(8794, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8794/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// pane: compact manage button; then the manager pop-up with a couple of added + hidden creators
await page.evaluate(() => {
  S.addedCreators = [
    { id:'UCbt1SGMrWj5Q7TMXAfmTERQ', name:'RegisKillbin', handle:'@RegisKillbin' },
    { id:'UCzzzzzzzzzzzzzzzzzzzzzz', name:'Jeff Hoogland', handle:'@JeffHoogland' },
  ];
  S.prefs.hiddenCreators = ['Coougarrr'];
  setTab('saved');
  document.querySelector('#savedseg [data-seg="creator"]').click();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/m1-pane.png' });
await page.evaluate(() => document.getElementById('btn-managecr').click());
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/m2-manager.png' });
await page.evaluate(() => closeModal());

// synergies: several one-liner rows, one open
await page.evaluate(() => {
  const id = n => (S.db.find(c => c.n === n) || {}).d;
  S.mySyns = [
    { id:'a', ids:[id('Wong'), id('Odin'), id('Black Panther')].filter(Boolean), note:'Odin re-triggers Wong-doubled On Reveals — Panther gets huge.' },
    { id:'b', ids:[id('Zabu'), id('Hope Summers')].filter(Boolean), note:'Discounts + extra energy = double 4-drop turns.' },
    { id:'c', ids:[id('Beast'), id('Hulk')].filter(Boolean), note:'' },
  ];
  S.synOpen = 'b'; renderMySyns(); setTab('ai');
  document.querySelector('main').scrollTo(0, 99999);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + '/m3-syn-oneliners.png' });

await browser.close();
server.close();
console.log('shots written to ' + OUT);
