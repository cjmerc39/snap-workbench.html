// Visual inspection harness (dev-only, not part of the app): screenshots the live UI at phone size.
// Usage: node shot.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8788/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

await page.evaluate(() => {
  const byName = n => (S.db.find(c => c.n.toLowerCase() === n.toLowerCase()) || {}).d;
  const want = ['Sunspot','Psylocke','Ironheart','Wolfsbane','Mystique','Wong','White Tiger','Black Panther','Odin','Ka-Zar','Iron Man','Arnim Zola','Doctor Doom','Ultron'];
  const ids = [...new Set(want.map(byName).filter(Boolean))];
  for(const c of S.db){ if(ids.length >= 12) break; if(!ids.includes(c.d) && c.c >= 1) ids.push(c.d); }
  const d = { id:'demo1', name:'Wong Ball Machine', cards: ids.slice(0,12), notes:'', verdict:'good', done:true, updated: Date.now() };
  S.decks = S.decks.filter(x => x.id !== 'demo1'); S.decks.unshift(d); S.activeId = 'demo1';
  materializeLines(d);
  const A = d.lines[0]; A.name = 'Main line';
  const pick = n => d.cards.find(id => (getCard(id)||{}).n === n) || d.cards[0];
  A.turns = [ [pick('Sunspot')], [pick('Psylocke')], [pick('Wong')], [pick('White Tiger'), pick('Ironheart')], [pick('Black Panther')], [pick('Odin')] ];
  d.lines.push({ id:'demoB', name:'No-Wong plan', turns:[[pick('Sunspot')],[pick('Psylocke')],[pick('Mystique')],[pick('Iron Man')],[pick('Black Panther')],[pick('Doctor Doom')]], adj:[0,0,0,0,0,0] });
  A.branch = { ifNot: pick('Wong'), byTurn: 3, toLineId: 'demoB' };
  d.activeLineId = A.id; d.line = A.turns;
  d.synAI = { text: 'Strongest engine: Wong into White Tiger and Black Panther, capped by Odin for a double re-trigger — that is the whole deck and it is a good one. Psylocke smooths the curve so Wong lands on 3 instead of 4. Tension: Mystique wants an Ongoing to copy but you only run Ka-Zar. The swap: Mystique out, Jubilee in for another body Odin can bounce.', at: '2026-07-10' };
  persistDecks(); renderAll(); setTab('deck'); setDeckTab('overview');
});
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/1-deck-top.png' });
await page.evaluate(() => { const lp = document.querySelector('#lineplan'); if(lp) lp.scrollIntoView({block:'start'}); });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/2-readview.png' });
const lp = await page.$('#lineplan');
if(lp) await lp.screenshot({ path: OUT + '/2b-readview-el.png' });
await page.evaluate(() => setDeckTab('planner'));
await page.waitForTimeout(500);
await page.evaluate(() => { const p = document.querySelector('#planner') || document.querySelector('.pl-lines'); if(p) p.scrollIntoView({block:'start'}); });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/3-planner.png' });
await page.evaluate(() => { const s = document.querySelector('.pl-slot[data-t="4"] .pl-slot-add, .pl-slot[data-t="4"]'); if(s) s.click(); });
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/4-picker.png' });
await page.evaluate(() => { if(typeof closePlPicker === 'function') closePlPicker(true); setDeckTab('synergy'); });
await page.waitForTimeout(500);
await page.evaluate(() => { const s = document.querySelector('#synergy'); if(s) s.scrollIntoView({block:'start'}); });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/5-synergy.png' });
await page.evaluate(() => window.scrollBy(0, 700));
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/6-synergy2.png' });
await page.evaluate(() => { S.decks = S.decks.filter(x => x.id !== 'demo1'); S.activeId = null; persistDecks(); });
await browser.close();
console.log('shots written to ' + OUT);
