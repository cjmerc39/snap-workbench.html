const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://example.com/',
  beforeParse(w){ w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder; w.confirm=()=>true; w.scrollTo=()=>{};
    w.fetch = async () => ({ json: async () => ({ content:[{type:'text',text:'mock coach reply'}], text:'mock coach reply' }) });
    Object.defineProperty(w.navigator,'clipboard',{configurable:true,
      value:{ readText:async()=>w.__clip||'', writeText:async()=>true }}); },
});
dom.window.addEventListener('error', e => errors.push(e.message));
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(150);
  const assert = (c,m)=>{ if(!c){console.error('FAIL:',m); process.exitCode=1;} else console.log('ok  :',m); };

  assert(errors.length===0, 'no runtime errors on boot'+(errors.length?' -> '+errors.join(' | '):''));
  assert(d.querySelectorAll('#cardlist .tile').length===357, 'renders 357 tiles');

  // --- round-2 restyle: sorting (Energy default: cost asc -> power asc -> name) ---
  assert(w.eval('SORTS.length')===3, 'SORTS has exactly 3 entries');
  assert(w.eval('SORTS.map(s=>s.k).join()')==='cost,power,name', 'SORTS keys are [cost,power,name]');
  assert(w.eval('SORTS.every(s=>s.k!=="series")'), 'series removed from SORTS (stays a filter facet only)');
  assert(w.eval('SORTS[0].fn({c:1},{c:2})')<0, 'Energy fn: lower cost sorts first');
  assert(w.eval('SORTS[0].fn({c:2,p:3,n:"B"},{c:2,p:9,n:"A"})')<0, 'Energy fn: equal cost -> lower power first (power asc)');
  assert(w.eval('SORTS[0].fn({c:2,p:5,n:"B"},{c:2,p:5,n:"A"})')>0, 'Energy fn: equal cost+power -> name ascending');
  assert(/Energy/.test(d.querySelector('#fw-sort [data-sort="cost"]').textContent), 'cost sort chip is labelled "Energy"');
  const bootOrder = w.eval('(function(){var t=[].slice.call(document.querySelectorAll("#cardlist .tile")).map(function(e){return e.dataset.d;});'+
    'var cost=function(id){return getCard(id).c;},pow=function(id){return getCard(id).p;};var mono=true,tie=false;'+
    'for(var i=1;i<t.length;i++){if(cost(t[i-1])>cost(t[i]))mono=false;if(cost(t[i-1])===cost(t[i])&&pow(t[i-1])>pow(t[i]))tie=true;}'+
    'return {mono:mono,firstLE:cost(t[0])<=cost(t[t.length-1]),tie:tie};})()');
  assert(bootOrder.mono && bootOrder.firstLE, 'boot grid renders in Energy order (cost non-decreasing)');
  assert(!bootOrder.tie, 'Energy sort breaks equal-cost ties by power ascending (no descending pair)');

  // art URL synthesis
  const u1 = w.eval('artUrl(S.byId["AbsorbingMan"])');
  assert(u1.endsWith('/cards/absorbing-man.webp'), 'artUrl multi-word -> '+u1.split('/').pop());
  const u2 = w.eval('artUrl(S.byId["Abomination"])');
  assert(u2.endsWith('/cards/abomination.webp'), 'artUrl single word ok');
  assert(w.eval('artUrl(makeStub("Whatever2026"))')===null, 'stubs get no art URL');

  // add 12 by tapping tiles
  const want = w.eval('S.db.slice(0,12).map(c=>c.d)');
  for(const id of want) d.querySelector('#cardlist .tile[data-d="'+id+'"]').click();
  await sleep(40);
  assert(d.querySelector('#bh-count').textContent==='12/12', 'tapping tiles fills deck to 12/12');
  d.querySelector('#cardlist .tile[data-d="Hulk"]').click(); // 13th
  await sleep(30);
  assert(d.querySelector('#st-count').textContent==='12/12', '13th card rejected');

  // tapping an in-deck tile removes it
  d.querySelector('#cardlist .tile[data-d="'+ want[0]+ '"]').click();
  await sleep(30);
  assert(d.querySelector('#st-count').textContent==='11/12', 'tapping again removes (11/12)');
  d.querySelector('#cardlist .tile[data-d="'+ want[0]+ '"]').click(); // re-add
  await sleep(30);

  // deck view minis
  assert(d.querySelectorAll('#decklist .mini').length===12, 'deck view shows 12 mini slots');

  // info button opens sheet without toggling
  const before = d.querySelector('#st-count').textContent;
  d.querySelector('#cardlist .tile[data-d="Hulk"] .cib').click();
  await sleep(30);
  assert(d.querySelector('#modalwrap').classList.contains('on'), 'i button opens detail sheet');
  assert(d.querySelector('#st-count').textContent===before, 'i button does not toggle deck');
  assert(d.querySelector('#modal .sname').textContent==='Hulk', 'sheet shows the right card');
  d.querySelector('#sh-own').click(); await sleep(30);
  assert(w.eval('S.owned.has("Hulk")'), 'sheet owned toggle works');
  w.eval('closeModal()');

  // code round trip + stubs
  const code = w.eval('exportCode(activeDeck())');
  const dec = JSON.parse(Buffer.from(code,'base64').toString('utf8'));
  assert(dec.Cards.length===12 && dec.Cards.every(c=>c.CardDefId), 'export encodes 12 CardDefIds');
  const p = w.eval('parseCode('+JSON.stringify(code)+')');
  assert(!p.err && p.ids.length===12, 'parseCode round-trips');
  const foreign = Buffer.from(JSON.stringify({Name:'F',Cards:[{CardDefId:'AntMan'},{CardDefId:'BrandNew2026'}]})).toString('base64');
  w.eval('(function(){const r=parseCode('+JSON.stringify(foreign)+'); r.ids.filter(id=>!S.byId[id]).forEach(makeStub); S.decks.unshift({id:"t1",name:r.name,cards:r.ids,updated:Date.now()}); S.activeId="t1"; renderAll();})()');
  await sleep(30);
  const dec2 = JSON.parse(Buffer.from(w.eval('exportCode(activeDeck())'),'base64').toString('utf8'));
  assert(dec2.Cards.some(c=>c.CardDefId==='BrandNew2026'), 'stub survives re-export');
  assert(d.querySelector('#deckwarn .warnbox')!==null, 'stub warning shown');

  // updater with art
  const mz = JSON.stringify({success:{cards:Array.from({length:60},(_,i)=>({name:'T '+i,type:'Character',cost:i%6+1,power:i%9,
    ability:i%5?'<span>On Reveal</span>: x'+i:'', flavor:i%5?'':'"V!"', status:'released', carddefid:'T'+i,
    source_slug:'pool-'+((i%5)+1), art:'https://marvelsnapzone.com/x/t'+i+'.webp', variants:[]}))}});
  const r2 = w.eval('parseDbPaste('+JSON.stringify(mz)+')');
  assert(!r2.err && r2.cards.length===60 && r2.cards[0].i && r2.cards[0].i.indexOf('http')===0, 'updater captures art URLs');


  // v2.1 additions
  assert(w.eval('!!S.byId["MrFantastic"]') && w.eval('S.byId["MrFantastic"].c')===3, 'base Mister Fantastic patched in');
  w.eval('openDbUpdate()'); await sleep(20);
  assert(d.querySelector('#m-clip')!==null, 'clipboard update button present');
  w.eval('closeModal()');
  w.eval('document.getElementById("btn-settings").onclick()'); await sleep(20);
  assert(d.querySelector('#m-refresh')!==null, 'one-click refresh shown when REFRESH_URL configured');
  w.eval('closeModal()');
  const addedN = await w.eval('applyDb(S.db.concat([{n:"Fake New",d:"FakeNew1",c:2,p:3,a:"On Reveal: test.",s:"5"}]))');
  assert(addedN===1 && w.eval('S.byId["FakeNew1"].n')==='Fake New', 'applyDb merges and indexes new cards');


  // storage shim: jsdom has localStorage, no window.storage -> shim should engage
  assert(w.eval('S.storageOK')===true && w.eval('HAS_LOCAL_STORE')===true, 'localStorage shim engages when window.storage absent');
  await sleep(600); // let the debounced save flush after all the deck edits above
  const persisted = w.eval('JSON.parse(localStorage.getItem("snapwb-decks")||"null")');
  assert(persisted && Array.isArray(persisted.decks) && persisted.decks.length>0, 'decks actually persist to localStorage');


  // v3: compact default, density toggle, tray, unpadded import, notes
  assert(d.querySelector('#cardlist').classList.contains('cmp'), 'compact grid is default');
  assert(d.querySelector('#cardlist .tile.cmp .cib')!==null, 'compact tiles have info button');
  d.querySelector('#densityseg button[data-den="det"]').click(); await sleep(30);
  assert(!d.querySelector('#cardlist').classList.contains('cmp') && d.querySelector('#cardlist .tile .ib')!==null, 'detail toggle restores text tiles');
  d.querySelector('#densityseg button[data-den="cmp"]').click(); await sleep(30);
  // compact info button opens sheet without toggling deck
  const cntBefore = d.querySelector('#st-count').textContent;
  d.querySelector('#cardlist .tile.cmp .cib').click(); await sleep(30);
  assert(d.querySelector('#modalwrap').classList.contains('on') && d.querySelector('#st-count').textContent===cntBefore, 'cib opens sheet, no toggle');
  w.eval('closeModal()');
  // deck zone: always-visible 12 slots, tap removes, collapse toggles
  w.eval('setTab("cards")'); await sleep(20);
  assert(d.querySelectorAll('#dz .mini').length===12, 'deck zone always shows 12 slots');
  const cnt1 = w.eval('activeDeck().cards.length');
  const filled = d.querySelectorAll('#dz .mini:not(.empty)').length;
  assert(filled===cnt1, 'zone shows '+cnt1+' filled + '+(12-cnt1)+' empty');
  if(filled){ d.querySelector('#dz .mini:not(.empty)').click(); await sleep(30);
    assert(w.eval('activeDeck().cards.length')===cnt1-1, 'tapping a zone card removes it'); }
  assert(!d.querySelector('#deckzone').classList.contains('closed'), 'deck zone open by default (2x6 grid-first)');
  assert(/#dz\{[^}]*grid-template-columns:repeat\(6,/.test(html), 'deck zone is a 6-column grid (2 rows for 12)');
  d.querySelector('#bh-collapse').click(); await sleep(20);
  assert(d.querySelector('#deckzone').classList.contains('closed'), 'first collapse click tucks the zone away');
  d.querySelector('#bh-collapse').click(); await sleep(20);
  assert(!d.querySelector('#deckzone').classList.contains('closed'), 'second collapse click re-opens the zone');
  // in-deck collection tiles gray out (class present in compact mode)
  const someInDeck = w.eval('activeDeck().cards[0]');
  if(someInDeck) assert(d.querySelector('#cardlist .tile[data-d="'+someInDeck+'"]').classList.contains('indeck'), 'in-deck collection tile carries gray state');
  // filter panel: tap a cost chip in the always-in-DOM widget, badge updates, list narrows
  const allN = d.querySelectorAll('#cardlist .tile').length;
  d.querySelector('#fw-cost .chip[data-v="1"]').click(); await sleep(30);
  assert(d.querySelectorAll('#cardlist .tile').length < allN, 'cost filter narrows the grid');
  assert(d.querySelector('#fcount').textContent==='1', 'filter badge shows 1');
  // cost buckets: no 0 chip, "1-" absorbs 0-cost cards, 7+ costs live under 6+
  assert(d.querySelector('#fw-cost .chip[data-v="0"]')===null, 'no 0-cost chip (merged into 1-)');
  assert(/1-/.test(d.querySelector('#fw-cost .chip[data-v="1"]').textContent), 'low cost chip labelled 1-');
  const zeroShown = w.eval('(function(){var z=S.db.find(c=>c.c===0); if(!z) return true; return !!document.querySelector(\'#cardlist .tile[data-d="\'+z.d+\'"]\');})()');
  assert(zeroShown, '0-cost card passes the 1- filter');
  d.querySelector('#fp-clear').click(); await sleep(20);
  assert(d.querySelector('#fcount').textContent==='', 'clear-all empties the filter badge');
  // sort widget (always in DOM): power sort descends
  d.querySelector('#fw-sort [data-sort="power"]').click(); await sleep(30);
  const tiles = d.querySelectorAll('#cardlist .tile');
  const p0 = w.eval('getCard("'+tiles[0].dataset.d+'").p'), pl = w.eval('getCard("'+tiles[tiles.length-1].dataset.d+'").p');
  assert(p0 >= pl, 'power sort descends ('+p0+' -> '+pl+')');
  d.querySelector('#fw-sort [data-sort="cost"]').click(); await sleep(30);

  // --- v5 filter panel: live counts, power facet, active chips, accordion, clear-all ---
  assert(d.querySelector('#filterpanel')!==null, 'filter panel exists in DOM');
  const chipn0 = d.querySelector('#fw-cost .chipn');
  assert(chipn0 && /^\d+$/.test(chipn0.textContent), 'facet chips show live numeric counts ('+(chipn0&&chipn0.textContent)+')');
  const beforePow = d.querySelectorAll('#cardlist .tile').length;
  d.querySelector('#fw-power .chip[data-v="4-6"]').click(); await sleep(30);
  assert(d.querySelectorAll('#cardlist .tile').length < beforePow && w.eval('S.filters.power.size')===1, 'power facet filters the grid');
  assert(d.querySelector('#fcount').textContent==='1', 'power counts toward the filter badge');
  const fpChip = d.querySelector('#fp-active .fp-chip[data-facet="power"]');
  assert(fpChip!==null, 'active-filter chip shows for the power facet');
  fpChip.click(); await sleep(30);
  assert(w.eval('S.filters.power.size')===0, 'active-chip x removes just that filter value');
  const costW = d.querySelector('#filterpanel [data-facet="cost"]');
  const wasOpen = costW.classList.contains('open');
  costW.querySelector('.fw-head').click(); await sleep(20);
  assert(costW.classList.contains('open')===!wasOpen && w.eval('S.prefs.facetOpen.cost')===!wasOpen, 'facet accordion toggles and persists open state');
  costW.querySelector('.fw-head').click(); await sleep(20); // restore
  d.querySelector('#fw-cost .chip[data-v="2"]').click(); await sleep(20);
  d.querySelector('#fw-power .chip[data-v="1-3"]').click(); await sleep(20);
  assert(w.eval('S.filters.cost.size')===1 && w.eval('S.filters.power.size')===1, 'multiple facet sets populate');
  d.querySelector('#fp-clear').click(); await sleep(20);
  assert(w.eval('S.filters.cost.size===0 && S.filters.power.size===0 && S.filters.mech.size===0 && S.filters.series.size===0 && S.filters.owned===false'), 'clear-all empties every filter set incl power');
  // deck menu on build screen
  d.querySelector('#bh-menu').click(); await sleep(20);
  assert(d.querySelector('#dm-copy')!==null, 'build-screen deck menu opens');
  w.eval('closeModal()');
  // unpadded base64 import (Snap-style)
  const padded = Buffer.from(JSON.stringify({Cards:[{CardDefId:'Hulk'},{CardDefId:'AntMan'}]})).toString('base64');
  const unpadded = padded.replace(/=+$/,'');
  const rr = w.eval('parseCode('+JSON.stringify(unpadded)+')');
  assert(!rr.err && rr.ids.length===2, 'unpadded deck code decodes (the reported bug)');
  const messy = 'Check my deck! '+unpadded+' \u200B built in Workbench';
  const rr2 = w.eval('parseCode('+JSON.stringify(messy)+')');
  assert(!rr2.err && rr2.ids.length===2, 'code extracted from surrounding text');
  // notes persist on the deck object
  w.eval('setTab("deck")');
  const notesEl = d.querySelector('#decknotes');
  notesEl.value = 'Win con: big Hulk.';
  notesEl.dispatchEvent(new w.Event('input', {bubbles:true}));
  await sleep(30);
  assert(w.eval('activeDeck().notes')==='Win con: big Hulk.', 'deck notes save to the deck');

  // --- round-2 restyle: flyout filter/sort rail ---
  w.eval('setTab("cards")'); await sleep(10);
  const fly = d.querySelector('#flyout');
  assert(fly!==null && fly.getAttribute('role')==='dialog', 'flyout dialog wraps the relocated filter panel');
  assert(fly.querySelector('#filterpanel')!==null, '#filterpanel now lives inside the flyout');
  assert(!fly.classList.contains('open'), 'flyout starts closed');
  d.querySelector('#btn-filter').click(); await sleep(20);
  assert(fly.classList.contains('open'), 'btn-filter opens the flyout');
  assert(d.querySelector('#btn-filter').getAttribute('aria-expanded')==='true', 'btn-filter reports aria-expanded=true when open');
  d.querySelector('#fw-cost .chip[data-v="3"]').click(); await sleep(20);
  assert(d.querySelector('#fcount').textContent==='1' && fly.classList.contains('open'), 'facet click inside the flyout updates #fcount and keeps it open');
  const flyFpChip = d.querySelector('#fp-active .fp-chip');
  flyFpChip.click(); await sleep(20);
  assert(fly.classList.contains('open'), 'removing an active filter chip keeps the flyout open (detached-target guard)');
  d.querySelector('#fw-cost .chip[data-v="3"]').click(); await sleep(20); // re-apply so Clear all has work to do
  d.querySelector('#fp-clear').click(); await sleep(20);
  assert(fly.classList.contains('open'), 'Clear all inside the flyout keeps it open (detached-target guard)');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await sleep(20);
  assert(!fly.classList.contains('open') && d.querySelector('#btn-filter').getAttribute('aria-expanded')==='false', 'Escape closes the flyout and resets aria-expanded');
  d.querySelector('#btn-sort').click(); await sleep(20);
  assert(fly.classList.contains('open') && d.querySelector('#filterpanel [data-facet="sort"]').classList.contains('open'), 'btn-sort opens the flyout and expands the sort facet');
  d.querySelector('#fly-close').click(); await sleep(20);
  assert(!fly.classList.contains('open'), 'fly-close (×) dismisses the flyout');

  // --- WP1: de-gemmed tiles (gems ONLY on art-less fallback tiles) ---
  assert(/\.tile\.noart \.ovl\{display:flex/.test(html), 'CSS shows gems only on art-less (.noart) tiles');
  assert(!/\.tile \.ovl\{display:flex/.test(html), 'the always-on "gems over art" rule is gone');
  assert(w.eval('/ovl tc/.test(tileHtmlCompact(makeStub("ZzTest2026")))'), 'stub (art-less) tile keeps cost/power gem markup');
  assert(w.eval('/(^| )noart( |")/.test(tileHtmlCompact(makeStub("ZzTest2026")))'), 'stub tile is flagged .noart so its gems display');
  assert(d.querySelector('#cardlist .tile:not(.noart) .ovl') !== null, 'art tiles retain gem markup in the DOM (CSS-hidden, not removed)');

  // --- WP1 round-4: nameless art tiles (name only on .noart fallback; a11y via title/aria-label) ---
  assert(/\.tile:not\(\.noart\) \.tname\{display:none/.test(html), 'art tiles hide the detail name');
  assert(/\.tile:not\(\.noart\) \.cname-scrim\{display:none/.test(html), 'art tiles hide the grid name scrim');
  assert(/\.mini:not\(\.noart\) \.mname\{display:none/.test(html), 'art minis hide the name label');
  const artTile = d.querySelector('#cardlist .tile:not(.noart)');
  assert(artTile && (artTile.getAttribute('aria-label')||'').length>0, 'art tile exposes its name via aria-label');
  assert(artTile && (artTile.getAttribute('title')||'').length>0, 'art tile exposes its name via title (hover)');
  assert(d.querySelector('#cardlist .tile > .ownpip')!==null, 'owned pip is a standalone direct child of the tile root');
  assert(/\.tile\.owned \.ownpip\{display:block/.test(html), 'owned pip shows on owned tiles');
  assert(w.eval('/cname-scrim/.test(tileHtmlCompact(makeStub("ZzTest2026")))'), 'noart stub keeps its visible name scrim');
  assert(w.eval('/(^| )noart( |")/.test(tileHtmlCompact(makeStub("ZzTest2026")))'), 'stub tile is flagged .noart so its name shows');

  // --- WP1 round-4: seamless search bar + non-blocking filter panel (no scrim, no scroll-lock) ---
  w.eval('setTab("cards")'); await sleep(10);
  const sheet = d.querySelector('#flyout');
  const searchbar = d.querySelector('#searchbar');
  assert(searchbar!==null && d.querySelector('#searchbar #q')!==null, 'slim #searchbar holds the relocated search input');
  assert(d.querySelector('#flyscrim')===null, 'the blocking scrim element is gone');
  d.querySelector('#btn-search').click(); await sleep(30);
  assert(searchbar.classList.contains('on'), '#btn-search opens the slim search bar');
  assert(d.activeElement && d.activeElement.id === 'q', '#btn-search focuses the search field');
  assert(!d.body.classList.contains('sheet-open'), 'the search bar does NOT lock page scroll');
  // live search narrows the visible grid while the bar stays open and nothing is locked
  const _preSearch = d.querySelectorAll('#cardlist .tile').length;
  const _qEl = d.querySelector('#q'); _qEl.value='hulk';
  _qEl.dispatchEvent(new w.Event('input',{bubbles:true})); await sleep(160);
  assert(d.querySelectorAll('#cardlist .tile').length < _preSearch, 'typing live-filters the visible grid');
  assert(searchbar.classList.contains('on') && !d.body.classList.contains('sheet-open'), 'grid filters live with the bar open and no scroll-lock');
  // one-tap Clear pill: appears when active, zeroes BOTH search text and filter facets
  d.querySelector('#fw-cost .chip[data-v="1"]').click(); await sleep(30);
  const clearBtn = d.querySelector('#btn-clearall');
  assert(clearBtn.classList.contains('on'), 'clear-all pill shows when a search/filter is active');
  clearBtn.click(); await sleep(30);
  assert(w.eval('S.filters.q')==='' && w.eval('S.filters.cost.size')===0, 'one tap clears search text and every filter facet');
  assert(!clearBtn.classList.contains('on'), 'clear-all pill hides once nothing is active');
  assert(d.querySelector('#q').value==='', 'clearing also empties the search input');
  // finalize: the open bar owns the bottom band — clear pill + toolbar tuck away, x doubles as close
  assert(/#searchbar\.on ~ #btn-clearall, body\.on-cards #searchbar\.on ~ #toolbar\{display:none/.test(html), 'open search bar tucks the clear pill and toolbar (no bottom-band collision)');
  _qEl.value='hulk'; _qEl.dispatchEvent(new w.Event('input',{bubbles:true})); await sleep(160);
  d.querySelector('#sb-x').click(); await sleep(20);
  assert(d.querySelector('#q').value==='' && searchbar.classList.contains('on'), 'search x with text clears the query but keeps the bar open');
  d.querySelector('#sb-x').click(); await sleep(20);
  assert(!searchbar.classList.contains('on'), 'search x with an empty query closes the bar (mobile escape while the toolbar is tucked)');
  d.querySelector('#btn-search').click(); await sleep(30);
  // filter/sort panel: opens non-blocking, closes the still-open search bar, live-updates
  assert(searchbar.classList.contains('on'), 'search bar is still open before filtering');
  d.querySelector('#btn-filter').click(); await sleep(20);
  assert(sheet.classList.contains('open') && !searchbar.classList.contains('on'), 'opening filter closes the search bar (never overlap)');
  assert(!d.body.classList.contains('sheet-open'), 'the filter panel does NOT lock page scroll');
  d.querySelector('#fw-cost .chip[data-v="2"]').click(); await sleep(20);
  assert(w.eval('S.filters.cost.size')===1 && sheet.classList.contains('open'), 'facet click live-updates while the panel stays open');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await sleep(20);
  assert(!sheet.classList.contains('open'), 'Escape closes the filter panel');
  w.eval('clearAllFilters()'); await sleep(20);
  // toolbar is Build-only chrome
  assert(html.includes('body.on-cards #toolbar'), 'floating cluster is gated to the Build tab (body.on-cards)');

  // --- round-2 restyle: integrated deck sub-tabs ---
  w.eval('setTab("deck")'); await sleep(20);
  assert(d.querySelector('#decktabs')!==null, 'deck sub-tab bar (#decktabs) present');
  assert(d.querySelector('.dpane[data-pane="overview"]').classList.contains('on'), 'overview sub-tab active by default');
  d.querySelector('#decktabs [data-dtab="odds"]').click(); await sleep(20);
  assert(d.querySelector('.dpane[data-pane="odds"]').classList.contains('on') && !d.querySelector('.dpane[data-pane="notes"]').classList.contains('on'),
    'clicking Odds sub-tab shows odds pane and hides notes pane');
  assert(w.eval('S.deckTab')==='odds', 'S.deckTab tracks the active sub-tab');
  assert(d.querySelector('#drawodds .odds-grid.single')===null, 'R5-D: the deck-independent single-card odds table is removed');
  assert(d.querySelectorAll('#drawodds .odds-pick .odd-card').length===w.eval('activeDeck().cards.length'), 'R5-D: odds group-picker lists one chip per deck card');
  assert(d.querySelectorAll('#decklist .mini').length===12, 'deck minis (#decklist) still 12 after restructure');
  w.eval('setTab("cards")'); await sleep(10);
  assert(d.querySelectorAll('#dz .mini').length===12, 'build-zone minis (#dz) still 12 after restructure');


  // ============ WP2: analytics + import robustness ============
  // C1: draw / combo math (12-card singleton, hypergeometric)
  assert(w.eval('pBoth(5)') > 0.41 && w.eval('pBoth(5)') < 0.43, 'pBoth(5) in (.41,.43) -> '+w.eval('pBoth(5)').toFixed(3));
  assert(w.eval('pSingle(6)') === 0.75, 'pSingle(6) === .75');
  assert(w.eval('pEither(5)') > 0.9, 'pEither(5) > .9');

  // R5-D: general hypergeometric helpers (nCk / pAtLeastOne / pAll) + identities to the legacy fns
  assert(w.eval('nCk(12,3)')===220, 'nCk(12,3)===220');
  assert(w.eval('nCk(12,0)')===1 && w.eval('nCk(5,5)')===1 && w.eval('nCk(4,5)')===0, 'nCk edge cases (0/full/over)');
  let idOK = true;
  for(let t=0;t<=6;t++){ if(Math.abs(w.eval('pAtLeastOne(1,'+t+')') - w.eval('pSingle('+t+')')) > 1e-9) idOK = false; }
  assert(idOK, 'pAtLeastOne(1,t) === pSingle(t) for t in 0..6 (identity)');
  assert(Math.abs(w.eval('pAll(2,5)') - w.eval('pBoth(5)')) < 1e-9, 'pAll(2,5) ≈ pBoth(5)');
  assert(Math.abs(w.eval('pAtLeastOne(2,5)') - w.eval('pEither(5)')) < 1e-9, 'pAtLeastOne(2,5) ≈ pEither(5)');
  assert(w.eval('pAll(4,0)')===0, 'pAll(k,t) is 0 when fewer than k cards are seen (opening hand of 3 < 4)');

  // build a clean 12-card active deck for DOM-level analytics
  w.eval('(function(){ const ids=S.db.slice(0,12).map(c=>c.d); S.decks.unshift({id:"wp2",name:"WP2 Deck",cards:ids,updated:Date.now()}); S.activeId="wp2"; renderAll(); })()');
  await sleep(30);
  w.eval('setTab("deck")'); await sleep(20);

  // R5-D: draw-goal group picker — pick two card chips, the output shows odds; single table gone
  w.eval('S.oddsGroup.clear(); setDeckTab("odds")'); await sleep(20);
  assert(d.querySelector('#drawodds .odds-grid.single')===null, 'R5-D: single odds table gone on the 12-card deck');
  const oddCards = d.querySelectorAll('#drawodds .odds-pick .odd-card');
  assert(oddCards.length===w.eval('activeDeck().cards.length'), 'R5-D: odd-card chips === deck size ('+oddCards.length+')');
  oddCards[0].click(); await sleep(10); oddCards[1].click(); await sleep(20);
  assert(w.eval('S.oddsGroup.size')===2, 'R5-D: tapping two card chips builds a 2-card draw goal');
  assert(d.querySelector('#odds-out').textContent.includes('%'), 'R5-D: #odds-out shows a percentage for the group');
  assert(d.querySelectorAll('#odds-out .odds-grid').length===2, 'R5-D: #odds-out renders two bar rows (≥1 / all)');
  // presets: the "5+ finishers" chip is always emitted; clicking a non-empty preset replaces the group
  const presetLabels = w.eval('oddsPresets(sortedDeckCards(activeDeck())).map(p=>p.label)');
  assert(presetLabels.some(l=>/finishers/.test(l)), 'R5-D: a "5+ finishers" preset is always present');
  const nonEmptyIdx = w.eval('oddsPresets(sortedDeckCards(activeDeck())).findIndex(p=>p.ids.length)');
  if(nonEmptyIdx>=0){
    d.querySelectorAll('#drawodds .odds-quick .odd-preset')[nonEmptyIdx].click(); await sleep(20);
    assert(w.eval('S.oddsGroup.size')>0, 'R5-D: clicking a non-empty preset selects that synergy group');
  } else assert(true, 'R5-D: no non-empty preset for this deck (skipped)');
  // synthetic deck: enabler + 5-cost payoff -> destroy preset carries ids (deterministic)
  assert(w.eval('oddsPresets([{n:"C",d:"Cx",c:2,p:2,a:"Destroy your other cards here."},{n:"K",d:"Kx",c:5,p:8,a:"When a card is destroyed, this gains +2 Power."}]).some(p=>p.ids.length>0)'),
    'R5-D: oddsPresets emits non-empty enabler/payoff groups for a destroy package');

  // C3: archetype auto-tagging (all-Ongoing deck -> "Ongoing"); active-deck pill populated
  const ongoingDeck = Array.from({length:12},(_,i)=>({n:'Og'+i,d:'Og'+i,c:(i%6)+1,p:i%8,a:'Ongoing: +1 Power.',s:'3'}));
  const arch = w.eval('classifyArchetype('+JSON.stringify(ongoingDeck)+')');
  assert(Array.isArray(arch) && arch.includes('Ongoing'), 'all-Ongoing deck classifies as Ongoing ('+arch.join('/')+')');
  assert(d.querySelector('#archetag').textContent.length>0, '#archetag pill populated for active deck');

  // C2: synergy detection — destroy payoff w/o enabler -> missing-enabler; + enabler -> active
  const payoffC  = {n:'Knuller', d:'Knuller1', c:5,p:8,a:'When a card is destroyed, this gains +2 Power.', s:'5'};
  const enablerC = {n:'Carnager',d:'Carnager1',c:2,p:2,a:'Destroy your other cards here.',              s:'3'};
  const vanillaC = {n:'Vanilla', d:'Van1',     c:1,p:2,a:'',                                             s:'1'};
  const dpo = [payoffC].concat(Array.from({length:11},()=>vanillaC));
  const dr1 = w.eval('deckSynergies('+JSON.stringify(dpo)+')').find(s=>s.key==='destroy');
  assert(dr1 && dr1.status==='incidental', 'R8: a single destroy payoff is incidental, not a gap');
  const payoffC2 = {n:'Deathish', d:'Deathish1', c:6,p:10,a:'Costs 1 less for each card destroyed this game.', s:'5'};
  const dpo2 = [payoffC, payoffC2].concat(Array.from({length:10},()=>vanillaC));
  const dr1b = w.eval('deckSynergies('+JSON.stringify(dpo2)+')').find(s=>s.key==='destroy');
  assert(dr1b && dr1b.status==='missing-enabler', 'R8: two destroy payoffs with no enabler -> real gap');
  const dwe = [payoffC, enablerC].concat(Array.from({length:10},()=>vanillaC));
  const dr2 = w.eval('deckSynergies('+JSON.stringify(dwe)+')').find(s=>s.key==='destroy');
  assert(dr2 && dr2.status==='active', 'destroy payoff + enabler -> active');

  // R8: positive interactions + creator-pair evidence
  const echoC = {n:'Odinson', d:'Odinson1', c:6,p:8,a:'On Reveal: activate the On Reveal abilities of your other cards here again.', s:'4'};
  const orC1 = {n:'Rev1',d:'Rev1',c:1,p:2,a:'On Reveal: gain +1 Power.',s:'1'};
  const orC2 = {n:'Rev2',d:'Rev2',c:2,p:3,a:'On Reveal: draw a card.',s:'1'};
  const orC3 = {n:'Rev3',d:'Rev3',c:3,p:4,a:'On Reveal: heal it.',s:'1'};
  const echoDeck = [echoC,orC1,orC2,orC3].concat(Array.from({length:8},()=>vanillaC));
  const inter = w.eval('deckInteractions('+JSON.stringify(echoDeck)+')');
  assert(inter.some(r=>/re-triggers your 3 On Reveal cards/.test(r.text)), 'R8: echo interaction row fires with 3 partners');
  w.eval('window.__cdBak = S.creatorDecks; S.creatorDecks = ['+
    '{creator:"A",video:"v",ids:["Odinson1","Rev1","Hulk"]},'+
    '{creator:"B",video:"v",ids:["Odinson1","Rev1","AntMan"]},'+
    '{creator:"C",video:"v",ids:["Hulk","AntMan","Wong"]}]');
  const pev = w.eval('creatorPairEvidence('+JSON.stringify(echoDeck)+')');
  assert(pev.length===1 && pev[0].n===2, 'R8: creator-pair evidence finds the pair seen in 2 creator decks');
  w.eval('renderSynergy('+JSON.stringify(echoDeck)+')'); await sleep(10);
  assert(d.querySelector('#synergy .syn-sec')!==null && d.querySelector('#synergy .syn-row')!==null, 'R8: synergy pane renders Working-together section rows');
  assert(d.querySelector('#synergy .syn-pair-n')!==null, 'R8: creator-pair evidence row renders with its count badge');
  w.eval('S.creatorDecks = window.__cdBak;');

  // C4: goldfish draw simulator
  const simIds = w.eval('activeDeck().cards');
  const sim = w.eval('simHand('+JSON.stringify(simIds)+')');
  assert(sim.order.length===12 && new Set(sim.order).size===12, 'simHand returns 12 unique ids');
  assert(sim.order.every(id=>simIds.indexOf(id)>=0), 'all sim ids belong to the deck');
  d.querySelector('#btn-testdraw').click(); await sleep(20);
  assert(d.querySelectorAll('#simpanel .sim-grid .mini').length===3, 'deal deals a 3-card opening hand');
  const simOrder = w.eval('S.sim.order');
  const shownIds = Array.from(d.querySelectorAll('#simpanel .sim-grid .mini')).map(m=>m.getAttribute('data-d'));
  assert(shownIds.join()===simOrder.slice(0,3).join(), 'opening hand is the first 3 of the order');
  d.querySelector('#sim-next').click(); await sleep(20);
  assert(d.querySelectorAll('#simpanel .sim-grid .mini').length===4, 'next turn reveals a 4th card');
  d.querySelector('#sim-reset').click(); await sleep(20);
  assert(d.querySelector('#simpanel').innerHTML==='', 'reset clears the sim panel');

  // C5: curve-health hints (no 1-cost deck flags it)
  const no1 = Array.from({length:12},(_,i)=>({n:'H'+i,d:'H'+i,c:(i%3)+2,p:5,a:'',s:'3'})); // costs 2..4
  const ch = w.eval('curveHealth('+JSON.stringify(no1)+')');
  assert(ch.some(h=>/1-cost|1-drop/i.test(h)), 'curveHealth flags missing 1-cost ('+ch.join(' | ')+')');

  // C6: side-by-side compare
  const cmpA = {cards:['A','B','C']}, cmpB = {cards:['B','C','D']};
  const dd = w.eval('diffDecks('+JSON.stringify(cmpA)+','+JSON.stringify(cmpB)+')');
  assert(dd.shared.length===2 && dd.shared.includes('B') && dd.shared.includes('C'), 'diffDecks shared correct');
  assert(dd.onlyA.join()==='A' && dd.onlyB.join()==='D', 'diffDecks only-A / only-B correct');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#btn-compare').click(); await sleep(20);
  assert(d.querySelector('#comparepanel')!==null && d.querySelector('#cmp-a')!==null, 'compare modal opens with two deck selects');
  w.eval('closeModal()');

  // D: parseCode robustness — ?deck= URL param
  const bU = Buffer.from(JSON.stringify({Cards:[{CardDefId:'Hulk'},{CardDefId:'AntMan'}]})).toString('base64');
  const urlForm = 'https://marvelsnap.com/s?deck='+encodeURIComponent(bU);
  const pu = w.eval('parseCode('+JSON.stringify(urlForm)+')');
  assert(!pu.err && pu.ids.length===2 && pu.ids[0]==='Hulk', 'parseCode extracts a ?deck= URL param');
  // D: bare percent-encoded base64 that genuinely contains %2B / %2F / %3D mid-string.
  // (Unicode name forces + and / into the base64 body; pure-ASCII deck JSON never does.)
  const uniName = 'D767Ͽ'; // trailing U+03FF (2-byte UTF-8) forces +/ into the base64 body
  const fixedIds = ['Hulk','AntMan','Wong','Odin','Ironheart','MisterFantastic','Klaw','Cyclops','Sentinel','Hawkeye','Nightcrawler','Angela'];
  const b12 = Buffer.from(JSON.stringify({Name:uniName, Cards:fixedIds.map(id=>({CardDefId:id}))})).toString('base64');
  assert(/\+/.test(b12) && /\//.test(b12), 'test payload really contains + and / in its base64');
  const enc12 = encodeURIComponent(b12);
  assert(/%2B/i.test(enc12) && /%2F/i.test(enc12), 'encoded payload has mid-string %2B/%2F');
  const pe = w.eval('parseCode('+JSON.stringify(enc12)+')');
  assert(!pe.err && pe.ids.length===12, 'parseCode decodes percent-encoded base64 (%2B/%2F/%3D) -> '+(pe.ids?pe.ids.length:pe.err));

  // restore an ordinary active deck / tab for the remaining suite
  w.eval('S.activeId="wp2"; setTab("cards")'); await sleep(10);


  // site-data auto-load: mock a cards.json fetch and confirm it takes over
  const fakeSite = { updated:'2026-07-08', cards: Array.from({length:400},(_,i)=>({n:'Site '+i,d:'Site'+i,c:i%7,p:i%13,a:'On Reveal: s'+i,s:'4'})) };
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(fakeSite)+')}); const got=await loadSiteData(); window.fetch=of; window.__site=got; })()');
  assert(w.eval('window.__site')===true && w.eval('S.siteData')===true, 'loadSiteData ingests site cards.json');
  assert(w.eval('S.db.length')===400 && w.eval('S.dbLabel').includes('2026-07-08'), 'site data replaces db with dated label');
  // malformed site data is rejected
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({whatever:1})}); window.__bad=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__bad')===false, 'malformed cards.json is safely ignored');


  // WP1: slim sticky build-top now holds ONLY the deck tray; controls float / live in the sheet
  const bt = d.querySelector('#buildtop');
  assert(bt && bt.querySelector('#dz') && bt.querySelector('#bhead'), 'sticky buildtop holds the deck tray (dz + bhead)');
  assert(!bt.querySelector('#q') && !bt.querySelector('#btn-filter'), 'search + filter controls no longer sit inside the buildtop');
  const toolbar = d.querySelector('#toolbar');
  assert(toolbar && toolbar.querySelector('#btn-search') && toolbar.querySelector('#btn-sort') && toolbar.querySelector('#btn-filter'),
    'floating #toolbar cluster holds search / sort / filter');
  assert(d.querySelector('#searchbar #q') !== null && d.querySelector('#flyout #q') === null, 'search input relocated into the slim #searchbar (out of the sheet)');
  assert(d.querySelector('#flyout #filterpanel') !== null, 'filter panel stays inside the bottom sheet');

  // --- v5 responsive / sticky offset ---
  assert(html.includes('@media (min-width:900px)'), 'desktop media query present');
  const stickTop = d.documentElement.style.getPropertyValue('--stick-top');
  assert(stickTop.endsWith('px'), 'sticky-offset var resolves to px ('+stickTop+')');

  // ============ WP2 round-3: 5th tab, Collection, bulk owned, import torture ============
  // --- 5-up tab bar + Collection view routing ---
  assert(d.querySelectorAll('#tabbar button').length===5, 'tab bar now has exactly 5 tabs');
  assert(d.querySelector('#tabbar [data-tab="collection"]')!==null, 'Collection (Cards) tab button present');
  w.eval('setTab("collection")'); await sleep(20);
  assert(d.querySelector('#view-collection').classList.contains('on'), 'collection view activates on setTab');
  assert(!d.querySelector('#view-cards').classList.contains('on'), 'build view is hidden while on collection');
  assert(!d.body.classList.contains('on-cards'), 'floating tool cluster is gated OFF on the collection tab');

  // isolate owned state (earlier tests left stray non-db ids like Hulk in S.owned)
  w.eval('S.owned.clear(); renderCollection();'); await sleep(10);

  // --- collection header + grouped grid reflect S.owned / S.db ---
  assert(parseInt(d.querySelector('#coll-count').textContent,10)===w.eval('S.owned.size'), 'coll-count = S.owned.size');
  assert(parseInt(d.querySelector('#coll-total').textContent,10)===w.eval('S.db.length'), 'coll-total = S.db.length');
  assert(d.querySelectorAll('#colllist .tile').length>0, 'collection grid lists cards');
  assert(d.querySelectorAll('#colllist .coll-section').length>0, 'collection grid is grouped into series sections');
  assert(d.querySelector('#colllist .tile .cib')!==null, 'collection tiles carry the info button');

  // --- collection tap = toggle owned (NEVER the deck) ---
  const _deckLen = w.eval('activeDeck() ? activeDeck().cards.length : -1');
  const _ct = d.querySelector('#colllist .tile'); const _cid = _ct.dataset.d;
  const _own0 = w.eval('S.owned.has('+JSON.stringify(_cid)+')');
  _ct.click(); await sleep(20);
  assert(w.eval('S.owned.has('+JSON.stringify(_cid)+')') === !_own0, 'tapping a collection tile toggles owned');
  assert((w.eval('activeDeck() ? activeDeck().cards.length : -1'))===_deckLen, 'collection tap does NOT change the deck');
  assert(d.querySelector('#colllist .tile[data-d="'+_cid+'"]').classList.contains('owned') === !_own0, '.owned class flips on the tile');

  // --- returning to Build re-renders the grid so owned state is never stale (M2) ---
  w.eval('setTab("cards")'); await sleep(20);
  const _bt = d.querySelector('#cardlist .tile[data-d="'+_cid+'"]');
  if(_bt) assert(_bt.classList.contains('owned') === !_own0, 'Build grid reflects Collection owned toggle after tab switch');
  w.eval('setTab("collection")'); await sleep(20);

  // --- collection info button opens the sheet without toggling owned ---
  const _ownSize = w.eval('S.owned.size');
  d.querySelector('#colllist .tile .cib').click(); await sleep(20);
  assert(d.querySelector('#modalwrap').classList.contains('on'), 'collection info button opens the detail sheet');
  assert(w.eval('S.owned.size')===_ownSize, 'collection info button does not toggle owned');
  w.eval('closeModal()');

  // --- bulk: mark all owned completes the collection ---
  d.querySelector('#coll-all').click(); await sleep(20);
  assert(w.eval('S.owned.size')===w.eval('S.db.length'), 'Mark all owned -> whole collection owned');
  assert(parseInt(d.querySelector('#coll-count').textContent,10)===w.eval('S.db.length'), 'header updates to full collection');

  // --- bulk: clear all (confirm mocked true) empties it ---
  d.querySelector('#coll-clear').click(); await sleep(20);
  assert(w.eval('S.owned.size')===0, 'Clear all empties the collection');

  // --- detail sheet <-> collection grid stay in sync through renderAll ---
  const _syncId = d.querySelector('#colllist .tile').dataset.d;
  const _wasOwned = w.eval('S.owned.has('+JSON.stringify(_syncId)+')');
  w.eval('openCardSheet('+JSON.stringify(_syncId)+')'); await sleep(20);
  d.querySelector('#sh-own').click(); await sleep(20);
  assert(w.eval('S.owned.has('+JSON.stringify(_syncId)+')') === !_wasOwned, 'sheet #sh-own toggle flips S.owned');
  assert(d.querySelector('#colllist .tile[data-d="'+_syncId+'"]').classList.contains('owned') === !_wasOwned,
    'collection grid reflects the #sh-own toggle after renderAll');
  w.eval('closeModal()');

  // --- per-series own/clear touches ONLY that series (synthetic multi-series db) ---
  w.eval('(function(){ window.__dbSave=S.db; window.__ownSave=S.owned; '+
    'S.db=[{n:"Ba",d:"XB",c:1,p:1,a:"",s:"Base"},{n:"S1a",d:"X1a",c:2,p:2,a:"",s:"1"},'+
    '{n:"S1b",d:"X1b",c:3,p:3,a:"",s:"1"},{n:"S2a",d:"X2a",c:4,p:4,a:"",s:"2"}]; '+
    'S.owned=new Set(); indexDb(); renderCollection(); })()');
  await sleep(20);
  d.querySelector('#coll-bars .cb-mini[data-series="1"][data-act="own"]').click(); await sleep(20);
  assert(w.eval('S.owned.has("X1a") && S.owned.has("X1b")'), 'per-series Own all marks the whole series');
  assert(w.eval('!S.owned.has("XB") && !S.owned.has("X2a")'), 'per-series Own all marks ONLY that series');
  assert(w.eval('S.owned.size')===2, 'per-series own touched exactly the 2 series-1 cards');
  d.querySelector('#coll-bars .cb-mini[data-series="1"][data-act="clear"]').click(); await sleep(20);
  assert(w.eval('S.owned.size')===0, 'per-series Clear empties just that series');
  w.eval('(function(){ S.db=window.__dbSave; S.owned=window.__ownSave; indexDb(); renderAll(); })()'); await sleep(20);

  // --- import torture suite: gather-all-candidates, validate-each, first-valid wins ---
  const mk = ids => Buffer.from(JSON.stringify({Name:'T',Cards:ids.map(id=>({CardDefId:id}))})).toString('base64');
  const realCode = mk(['Hulk','AntMan','Wong']);
  // 1) reddit-style multiline comment (greeting + short lines + code line + trailing prose)
  const reddit = 'Been climbing with this all season, give it a shot:\nturn 1 nightcrawler\n'+realCode+'\nlmk what you think!';
  let tr = w.eval('parseCode('+JSON.stringify(reddit)+')');
  assert(!tr.err && tr.ids.length===3 && tr.ids[0]==='Hulk', 'import: reddit multiline comment');
  // 2) two base64 strings — the LONGER one is a non-deck decoy; the real shorter one must win
  const decoy = Buffer.from(JSON.stringify({note:'x'.repeat(160)})).toString('base64');
  assert(decoy.length>realCode.length, 'decoy is genuinely longer than the real code');
  tr = w.eval('parseCode('+JSON.stringify('first '+decoy+' then '+realCode)+')');
  assert(!tr.err && tr.ids.length===3 && tr.ids[0]==='Hulk', 'import: longer decoy skipped, real shorter code wins');
  // 3) full URL with extra query params surrounding deck=
  const urlx = 'https://marvelsnap.com/decks?utm=reddit&deck='+encodeURIComponent(realCode)+'&ref=abc';
  tr = w.eval('parseCode('+JSON.stringify(urlx)+')');
  assert(!tr.err && tr.ids[0]==='Hulk' && tr.ids.length===3, 'import: URL with extra params around deck=');
  // 4) markdown backtick-wrapped
  tr = w.eval('parseCode('+JSON.stringify('`'+realCode+'`')+')');
  assert(!tr.err && tr.ids.length===3, 'import: markdown backtick-wrapped code');
  // 5) straight-quote wrapped
  tr = w.eval('parseCode('+JSON.stringify('"'+realCode+'"')+')');
  assert(!tr.err && tr.ids.length===3, 'import: quote-wrapped code');
  // 6) emoji-wrapped
  tr = w.eval('parseCode('+JSON.stringify('🔥'+realCode+'🎉')+')');
  assert(!tr.err && tr.ids.length===3, 'import: emoji-wrapped code');
  // 7) raw JSON object paste
  tr = w.eval('parseCode('+JSON.stringify(JSON.stringify({Name:'J',Cards:[{CardDefId:'Hulk'}]}))+')');
  assert(!tr.err && tr.ids[0]==='Hulk', 'import: raw JSON object paste');
  // 8) pure prose -> friendly error, no ids
  tr = w.eval('parseCode("just some words with no deck code at all here")');
  assert(tr.err && !tr.ids, 'import: pure prose returns a friendly error');
  // regression: every legacy-accepted input still parses
  assert(!w.eval('parseCode('+JSON.stringify(realCode)+')').err, 'import regression: plain base64 still parses');
  assert(!w.eval('parseCode('+JSON.stringify(realCode.replace(/=+$/,''))+')').err, 'import regression: unpadded still parses');

  // ============ WP2 round-4: untapped decoders + clipboard import + creator decks ============
  // reset to the REAL shipped card set so S.short / S.byId reflect it (prior tests swapped in fake site cards)
  w.eval('S.db = DB_BASE.slice(); indexDb();'); await sleep(10);

  // --- D: owner's exact untapped compressed payload (canonical regression) ---
  const PAYLOAD='TmNobHNTY3J0Y2hGLFNwZHJNbkJybmROd0QxNCxDbDQsTXJsbjYsTXJ2bEI5LFByd2xyNyxCc2hwNixWbnM1LFdiU2xuZzgsVGhDbGxjdHJDLFdyd2xmQk5naHRGLFNzcXRjaDk=';
  const rp = w.eval('parseCode('+JSON.stringify(PAYLOAD)+')');
  assert(!rp.err && rp.ids.length===12, 'owner untapped compressed payload -> 12 cards');
  assert(rp.ids[0]==='NicholasScratch' && rp.ids[11]==='Sasquatch', 'compressed tokens map in order');
  assert(rp.ids.filter(id=>w.eval('!!S.byId["'+id+'"]')).length>=8, 'clear majority resolve to real cards (rest stub)');
  // compressed decoder needs a strict majority-known list; a mostly-garbage comma list is rejected
  assert(w.eval('parseCode("zzz,qqq,vvv,xxx,jjj,kkk").err'), 'compressed decoder rejects a non-majority comma list');

  // --- R7 owner fix: two-row build header (full deck name on its own row, controls below) ---
  assert(d.querySelector('#bhead #bh-title #bh-name')!==null && d.querySelector('#bh-title #bh-count')===null,
    'build header row 1 holds the name only (count moved out)');
  assert(d.querySelector('#bh-row2 #bh-count')!==null && d.querySelector('#bh-row2 #bh-done')!==null,
    'build header row 2 holds count + Done controls');

  // --- vowel-initial words (owner-reported stubs): untapped keeps word-initial capitals in its skeletons ---
  assert(w.eval('S.short["Armr5"]')==='Armor', 'skeleton keeps capital vowels: Armr5 -> Armor');
  assert(w.eval('S.short["AntMn6"]')==='AntMan', 'skeleton keeps capital vowels: AntMn6 -> AntMan');
  assert(w.eval('S.short["RcktAndGrtE"]')==='RocketAndGroot', 'skeleton keeps capital vowels: RcktAndGrtE -> RocketAndGroot');
  w.eval('applyDb(S.db.concat(['+
    '{n:"Mother Askani",d:"MotherAskani",c:3,p:5,a:"t",s:"5"},'+
    '{n:"The Fallen One",d:"FallenOne",c:5,p:9,a:"t",s:"5"},'+
    '{n:"Star-Lord, Master of the Sun",d:"StarlordMasterOfTheSun",c:4,p:6,a:"t",s:"5"}]))'); await sleep(10);
  const vowelIds = w.eval('["MthrAsknC","FllnOn9","StrlrdMstrOfThSn16"].map(t=>S.short[t]||"MISS").join()');
  assert(vowelIds==='MotherAskani,FallenOne,StarlordMasterOfTheSun', 'vowel-initial compressed tokens all resolve ('+vowelIds+')');
  w.eval('S.db = DB_BASE.slice(); indexDb();'); await sleep(10);

  // --- D: untapped URL slug (DB-known ids) ---
  const SLUGIDS=['Hulk','AntMan','Wong','Odin','Ironheart','MisterFantastic','Klaw','Cyclops','Sentinel','Hawkeye','Nightcrawler','Angela'];
  const su='https://snap.untapped.gg/en/decks/'+SLUGIDS.join('-')+'_MyDeck?utm_medium=affiliate&utm_campaign=alexcoccia';
  const rs=w.eval('parseCode('+JSON.stringify(su)+')');
  assert(!rs.err && rs.ids.length===12 && rs.ids[0]==='Hulk' && rs.name==='MyDeck', 'untapped slug decodes 12 ids + name');
  const sm='https://snap.untapped.gg/en/decks/'+SLUGIDS.join('-')+'_Sub-Mariner&utm_campaign=x';
  const rm=w.eval('parseCode('+JSON.stringify(sm)+')');
  assert(!rm.err && rm.ids.length===12 && rm.name==='Sub-Mariner', 'slug: malformed utm + hyphen name');

  // --- D: clipboard-first import (preview -> confirm) ---
  const _decksBefore = w.eval('S.decks.length');
  w.eval('window.__clip='+JSON.stringify(PAYLOAD));
  await w.eval('openImport()'); await sleep(40);
  assert(d.querySelector('#importpreview')!==null, 'clipboard deck -> preview appears (no paste needed)');
  assert(d.querySelectorAll('#importpreview .mini').length===12, 'preview shows all 12 cards as minis');
  d.querySelector('#imp-confirm').click(); await sleep(30);
  assert(w.eval('S.decks.length')===_decksBefore+1, 'confirm adds the imported deck to S.decks');
  assert(!d.querySelector('#modalwrap').classList.contains('on'), 'confirm closes the import modal');
  // --- D: empty clipboard falls back to the paste box ---
  w.eval("window.__clip=''");
  await w.eval('openImport()'); await sleep(40);
  assert(d.querySelector('#importbox')!==null, 'empty clipboard -> paste box fallback');
  assert(d.querySelector('#importpreview')===null, 'no preview when clipboard is empty');
  assert(d.querySelector('#m-clip')!==null, 'fallback box offers a Paste-from-clipboard button');
  w.eval('closeModal()'); w.eval("window.__clip=''");

  // --- E: creator-decks loader (mirror loadSiteData mock pattern) ---
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+
    JSON.stringify({updated:'2026-07-09',decks:[{creator:'X',video:'V',url:'u',published:'2026-07-01',name:'N',ids:SLUGIDS}]})+
    ')}); window.__cl=await loadCreatorDecks(); window.fetch=of; })()');
  assert(w.eval('window.__cl')===true && w.eval('S.creatorDecks.length')===1, 'loadCreatorDecks ingests creator-decks.json');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({whatever:1})}); window.__clb=await loadCreatorDecks(); window.fetch=of; })()');
  assert(w.eval('window.__clb')===false, 'malformed creator-decks.json is safely ignored');

  // --- E: creator segment renders + Save-a-copy + link-out for undecodable ---
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+
    JSON.stringify({updated:'2026-07-09',decks:[
      {creator:'Alexander Coccia',video:'Big Deck Video',url:'https://youtu.be/abc',published:'2026-07-08',name:'Test Deck',ids:SLUGIDS},
      {creator:'Coougarrr',video:'Link Only',url:'https://youtu.be/def',published:'2026-07-05',name:'',ids:[],untapped:'https://snap.untapped.gg/en/decks/Hulk-AntMan_X'}
    ]})+
    ')}); await loadCreatorDecks(); window.fetch=of; })()');
  w.eval('setTab("saved")'); await sleep(20);
  assert(d.querySelector('#creatorlist').children.length===0, 'hidden creator list stays unrendered until the segment is opened (lazy)');
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(30);
  assert(d.querySelectorAll('#creatorlist .crow').length===2, 'creator segment renders one row per harvested deck');
  const _decksB2 = w.eval('S.decks.length');
  d.querySelector('#creatorlist .crow .abtn.primary').click(); await sleep(30);
  assert(w.eval('S.decks.length')===_decksB2+1, 'Save a copy adds the creator deck to S.decks');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(20);
  const _crows = d.querySelectorAll('#creatorlist .crow');
  assert(_crows[1].querySelector('.abtn.primary')===null, 'undecodable creator deck (ids:[]) has no Save button');
  assert(_crows[1].querySelector('a[href*="untapped.gg"]')!==null, 'undecodable creator deck shows an untapped link-out');

  // --- E: the REAL shipped creator-decks.json parses + renders in-app ---
  const _realCD = JSON.parse(fs.readFileSync('creator-decks.json','utf8'));
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(_realCD)+')}); window.__realcd=await loadCreatorDecks(); window.fetch=of; })()');
  assert(w.eval('window.__realcd')===true && w.eval('S.creatorDecks.length')>0, 'shipped creator-decks.json parses + loads ('+w.eval('S.creatorDecks.length')+' decks)');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(30);
  assert(d.querySelectorAll('#creatorlist .crow').length===w.eval('S.creatorDecks.length'), 'every shipped creator deck renders a .crow row');
  d.querySelector('#savedseg [data-seg="mine"]').click(); await sleep(10);

  // restore an ordinary tab for the remaining suite
  w.eval('setTab("cards")'); await sleep(10);

  // ============ WP1 round-5: opacity, collection header, lifecycle, verdict, synergy ============
  // A: --frost token + near-solid floating surfaces (was too-transparent --glass-2)
  assert(/--frost:\s*rgba\(21,16,31,\.94\)/.test(html), 'A: --frost near-solid token defined');
  assert(/#searchbar\{[^}]*background:var\(--frost\)/.test(html), 'A: #searchbar uses --frost');
  assert(!/#searchbar\{[^}]*background:var\(--glass-2\)/.test(html), 'A: #searchbar no longer uses --glass-2');
  assert(/#flyout\{[^}]*background:var\(--frost\)/.test(html), 'A: #flyout uses --frost');
  assert(!/#flyout\{[^}]*background:var\(--glass-2\)/.test(html), 'A: #flyout no longer uses --glass-2');
  assert(/#searchbar\.on ~ #btn-clearall, body\.on-cards #searchbar\.on ~ #toolbar\{display:none/.test(html), 'A: bottom-band tuck rule preserved verbatim');

  // B: collection header no longer sticky; collapses to a one-line count; state persists (collapsed default)
  assert(!/#collhead\{[^}]*position:sticky/.test(html), 'B: collection header no longer sticky');
  w.eval('setTab("collection")'); await sleep(20);
  assert(d.querySelector('#collhead').classList.contains('closed'), 'B: collection header collapsed by default (cards immediately visible)');
  assert(d.querySelector('#coll-toggle')!==null, 'B: collapse toggle button present');
  assert(parseInt(d.querySelector('#coll-count').textContent,10)===w.eval('S.owned.size'), 'B: coll-count still tracks S.owned.size');
  assert(parseInt(d.querySelector('#coll-total').textContent,10)===w.eval('S.db.length'), 'B: coll-total still tracks S.db.length');
  d.querySelector('#coll-toggle').click(); await sleep(20);
  assert(!d.querySelector('#collhead').classList.contains('closed') && w.eval('S.prefs.collOpen')===true, 'B: toggle expands header + flips S.prefs.collOpen');
  await sleep(600);
  assert(w.eval('JSON.parse(localStorage.getItem("snapwb-prefs")||"{}").collOpen')===true, 'B: collOpen persists to storage');
  d.querySelector('#coll-toggle').click(); await sleep(20);   // restore collapsed
  w.eval('setTab("cards")'); await sleep(10);

  // C (R6): Done -> files the deck + BLANK bench; re-open from Saved to edit; auto-save; verdict
  w.eval('(function(){ const ids=S.db.slice(0,6).map(c=>c.d); S.decks.unshift({id:"wp1d",name:"WP1 Deck",cards:ids,updated:Date.now()}); S.activeId="wp1d"; renderAll(); })()');
  await sleep(20);
  w.eval('setTab("cards")'); await sleep(10);
  d.querySelector('#bh-done').click(); await sleep(20);
  assert(w.eval('(S.decks.find(x=>x.id==="wp1d")||{}).done')===true, 'C: Done marks the filed deck done');
  assert(w.eval('S.activeId')===null, 'C: Done clears activeId -> the bench goes BLANK');
  assert(w.eval('S.tab')==='saved', 'C: Done jumps to the Saved tab');
  w.eval('setTab("cards")'); await sleep(10);
  assert(d.querySelectorAll('#dz .mini:not(.empty)').length===0, 'C: blank bench shows no filled deck-zone slots');
  assert(d.querySelector('#bh-count').textContent==='0/12', 'C: blank bench header reads 0/12');
  assert(d.querySelector('#bh-name').textContent==='New deck', 'C: blank bench header reads "New deck"');
  assert(d.querySelector('#bh-done').style.display==='none', 'C: Done is hidden on a blank bench');
  // re-open the filed deck from Saved via its pencil quick-edit
  w.eval('setTab("saved")'); await sleep(20);
  const _wp1row = [...d.querySelectorAll('#savedlist .saverow')].find(r => /WP1 Deck/.test(r.querySelector('.sv-name').textContent));
  assert(_wp1row, 'C: the filed WP1 deck appears on the Saved shelf');
  _wp1row.querySelector('.sv-btn.edit').click(); await sleep(20);
  assert(w.eval('S.activeId')==='wp1d' && w.eval('S.tab')==='cards', 'C: pencil quick-edit re-opens the deck straight to Build');
  d.querySelector('#dz .mini:not(.empty)').click(); await sleep(20);   // a build edit
  assert(w.eval('activeDeck().done')===false, 'C: a build edit (card toggle) clears done -> back to editing');
  await sleep(600);
  assert(d.querySelector('#bh-save').textContent==='Saved ✓' && d.querySelector('#bh-save').classList.contains('saved'), 'C: auto-save indicator shows "Saved ✓" after the debounced write');
  w.eval('setTab("deck")'); await sleep(20);
  d.querySelector('#verdictrow [data-verdict="good"]').click(); await sleep(20);
  assert(w.eval('activeDeck().verdict')==='good', 'C: tapping the 👍 face sets verdict=good');
  assert(w.eval('activeDeck().done')===false, 'C: setting a verdict is a meta-edit (does NOT mark done)');
  w.eval('setTab("saved")'); await sleep(20);
  assert(d.querySelector('#savedlist .saverow .sv-verdict')!==null, 'C: verdict shows as a Saved-row badge');
  w.eval('setTab("deck")'); await sleep(20);
  d.querySelector('#verdictrow [data-verdict="good"]').click(); await sleep(20);
  assert(w.eval('activeDeck().verdict')===null, 'C: re-tapping the active verdict clears it to null');

  // E: synergy restyle — deckSynergies exposes names; scannable glass rows with count chips
  const _synE = w.eval('deckSynergies('+JSON.stringify(dwe)+')').find(s=>s.key==='destroy');
  assert(_synE && _synE.enablerNames.indexOf('Carnager')>=0, 'E: deckSynergies returns enablerNames (incl Carnager)');
  assert(/\.synbox\{[^}]*var\(--glass-2\)/.test(html), 'E: .synbox restyled to glass (var(--glass-2), not var(--panel))');
  w.eval('renderSynergy('+JSON.stringify(dwe)+')'); await sleep(10);
  assert(d.querySelector('#synergy .synbox .syn-count.enabler')!==null, 'E: synergy renders scannable enabler/payoff count chips');

  // ============ WP2 round-5: planner (F), change-flags (G), meta context (H) ============
  // --- F: play-line planner ---
  w.eval('setTab("deck")'); await sleep(20);
  const _plAuto = w.eval('autoSketchLine(sortedDeckCards(activeDeck()))');
  assert(Array.isArray(_plAuto) && _plAuto.length===6 && _plAuto.every(Array.isArray), 'F: autoSketchLine returns 6 turn arrays');
  assert(w.eval('lineFlags(autoSketchLine(sortedDeckCards(activeDeck()))).filter(f=>f.type==="energy").length')===0, 'F: auto-sketch never overspends energy (curve-out)');
  const _c3 = w.eval('(S.db.find(c=>c.c===3)||{}).d');
  assert(_c3, 'F: a real 3-cost card exists in the DB for the energy-flag test');
  const _feng = w.eval('lineFlags([['+JSON.stringify(_c3)+'],[],[],[],[],[]])');
  assert(_feng.some(f=>f.type==='energy' && f.turn===1), 'F: a lone 3-cost card in T1 flags an energy overspend');
  const _five = w.eval('activeDeck().cards.slice(0,5)');
  const _fdraw = w.eval('lineFlags(['+JSON.stringify(_five)+',[],[],[],[],[]])');
  assert(_five.length===5 && _fdraw.some(f=>f.type==='draw'), 'F: 5 cards played by T1 (only ~4 drawn) flags a draw problem');
  const _four = w.eval('activeDeck().cards.slice(0,4)');
  const _fbound = w.eval('lineFlags(['+JSON.stringify(_four)+',[],[],[],[],[]])');
  assert(_four.length===4 && !_fbound.some(f=>f.type==='draw'), 'F: exactly-drawable line (4 cards by T1 = DRAWN[1]) has no draw flag (boundary)');
  // DOM (R6-C): six always-visible turn slots + tap-turn card-picker sheet (zero scroll to the card)
  const _c3id = w.eval('(S.db.find(c=>c.c===3)||{}).d');
  w.eval('(function(){ var c3='+JSON.stringify(_c3id)+'; var extra=S.db.filter(function(c){return c.d!==c3;}).slice(0,5).map(function(c){return c.d;}); S.decks.unshift({id:"plr6",name:"Planner R6",cards:[c3].concat(extra),updated:Date.now()}); S.activeId="plr6"; })(); activeDeck().line=null; S.plannerTurn=null; setTab("deck"); setDeckTab("planner"); renderDeck();'); await sleep(20);
  assert(d.querySelectorAll('#planner .pl-slot[data-t]').length===6, 'F: composer renders six always-visible turn slots');
  assert(w.eval('S.plannerTurn')===null, 'F: no picker is open until a turn is tapped');
  // tapping a turn opens the picker bottom sheet anchored to the viewport
  d.querySelector('#planner .pl-slot[data-t="1"]').click(); await sleep(20);
  assert(d.querySelector('#pl-picker').classList.contains('on'), 'F: tapping a turn opens the #pl-picker bottom sheet');
  assert(w.eval('S.plannerTurn')===1, 'F: the picker targets the tapped turn (S.plannerTurn)');
  assert(d.querySelectorAll('#pl-picker .pl-pick .mini').length===w.eval('activeDeck().cards.length'), 'F: the picker grid lists every deck card');
  // pick the 3-cost card -> assigned to T1, energy overspend fires live + as a flag
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  assert(w.eval('(activeDeck().line[0]||[]).indexOf('+JSON.stringify(_c3id)+')>=0'), 'F: tapping a card in the picker assigns it to that turn');
  assert(w.eval('lineFlags(activeDeck().line).some(f=>f.type==="energy" && f.turn===1)'), 'F: a 3-cost card in T1 fires the energy overspend flag');
  assert(d.querySelector('#pl-picker-energy').classList.contains('over'), 'F: the live picker energy meter turns over-budget (red)');
  // per-turn toggle: tapping the same card again removes it
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  assert(w.eval('(activeDeck().line[0]||[]).indexOf('+JSON.stringify(_c3id)+')<0'), 'F: re-tapping the same card in the picker removes it (per-turn toggle)');
  // re-assign, then dismiss the sheet
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  d.querySelector('#pl-pick-done').click(); await sleep(20);
  assert(!d.querySelector('#pl-picker').classList.contains('on') && w.eval('S.plannerTurn')===null, 'F: Done dismisses the picker (S.plannerTurn back to null)');
  await sleep(600);
  const _linePersist = w.eval('(JSON.parse(localStorage.getItem("snapwb-decks")).decks.find(x=>x.id==="plr6")||{}).line');
  assert(Array.isArray(_linePersist) && (_linePersist[0]||[]).indexOf(_c3id)>=0, 'F: the planned line persists to storage');
  // tapping the assigned mini in its slot unassigns it
  d.querySelector('#planner .pl-slot[data-t="1"] .pl-mini-row .mini').click(); await sleep(20);
  assert(w.eval('(activeDeck().line[0]||[]).indexOf('+JSON.stringify(_c3id)+')<0'), 'F: tapping an assigned mini in its slot unassigns it');
  // Auto-sketch / Clear still drive the whole line
  d.querySelector('#pl-auto').click(); await sleep(20);
  assert(w.eval('activeDeck().line.reduce((n,s)=>n+s.length,0)')>0, 'F: Auto-sketch button fills the line');
  d.querySelector('#pl-clear').click(); await sleep(20);
  assert(w.eval('activeDeck().line.every(s=>s.length===0)'), 'F: Clear line empties every turn');
  // move-on-tap: re-assigning a placed card MOVES it (one-turn invariant)
  d.querySelector('#planner .pl-slot[data-t="1"]').click(); await sleep(20);
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  d.querySelector('#pl-pick-done').click(); await sleep(20);
  d.querySelector('#planner .pl-slot[data-t="2"]').click(); await sleep(20);
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  assert(w.eval('(activeDeck().line[1]||[]).indexOf('+JSON.stringify(_c3id)+')>=0 && (activeDeck().line[0]||[]).indexOf('+JSON.stringify(_c3id)+')<0'),
    'F: re-assigning a placed card MOVES it to the new turn (stays in exactly one turn)');
  d.querySelector('#pl-pick-done').click(); await sleep(20);

  // ============ ROUND 7 WP1: multi-line model (A) + composer manager (B) + read view (C) ============
  // --- A1: round-6 d.line migrates lazily to one "Main line" in lines[] ---
  const _mig = w.eval('(function(){ var dd={id:"r7mig",cards:["Hulk","AntMan"],line:[["Hulk"],[],[],[],[],[]],updated:Date.now()}; var L=getLines(dd); return {len:L.length, has:L[0].turns[0].indexOf("Hulk")>=0, name:L[0].name, adj:Array.isArray(L[0].adj)&&L[0].adj.length===6, untouched:dd.lines===undefined}; })()');
  assert(_mig.len===1 && _mig.has && _mig.name==='Main line' && _mig.adj, 'R7-A1: round-6 d.line migrates to one "Main line" in lines[] (adj seeded)');
  assert(_mig.untouched, 'R7-A1: getLines is a pure read — it never eagerly rewrites d.lines');

  // --- A2/A5: the plr6 deck was just edited through the composer -> materialized + mirror invariant ---
  assert(w.eval('Array.isArray(activeDeck().lines) && activeDeck().lines.length>=1'), 'R7-A2: an edited deck materializes a real lines[] array');
  assert(w.eval('activeDeck().line === activeDeck().lines[0].turns'), 'R7-A5: d.line is the SAME reference as lines[0].turns (round7->round6 mirror)');
  assert(w.eval('JSON.stringify(activeDeck().line)===JSON.stringify(activeDeck().lines[0].turns)'), 'R7-A2: d.line deep-equals lines[0].turns after an edit');

  // --- A4: a round-6 edit (differing d.line) reconciles into lines[0] while Plan B is preserved ---
  const _rec = w.eval('(function(){ var dd={ id:"r7rec", cards:["Hulk","AntMan","Wong"], line:[["Hulk"],[],[],[],[],[]], lines:[{id:"L0",name:"Main line",turns:[[],[],[],[],[],[]],adj:[0,0,0,0,0,0]},{id:"L1",name:"Line 2",turns:[["AntMan"],[],[],[],[],[]],adj:[0,0,0,0,0,0]}], updated:Date.now() }; var L=getLines(dd); return { adopted:L[0].turns[0].indexOf("Hulk")>=0, primaryId:L[0].id==="L0", keptB:L.length===2 && L[1].turns[0].indexOf("AntMan")>=0 }; })()');
  assert(_rec.adopted && _rec.primaryId && _rec.keptB, 'R7-A4: a round-6 d.line edit reconciles into lines[0] (id kept) while Plan B survives');
  const _recEq = w.eval('(function(){ var dd={id:"r7req",cards:["Hulk"],line:[["Hulk"],[],[],[],[],[]],lines:[{id:"K",name:"Main line",turns:[["Hulk"],[],[],[],[],[]],adj:[0,0,0,0,0,0]}],updated:1}; return getLines(dd)[0].id; })()');
  assert(_recEq==='K', 'R7-A4: when d.line already equals lines[0], the stored lines[] stays authoritative');

  // --- B: composer line manager (switch / add / rename / duplicate / delete) ---
  w.eval('S.activeId="plr6"; setTab("deck"); setDeckTab("planner"); renderDeck();'); await sleep(20);
  const _lb = w.eval('getLines(activeDeck()).length');
  d.querySelector('#planner [data-pladd]').click(); await sleep(20);
  assert(w.eval('activeDeck().lines.length')===_lb+1, 'R7-B: the + button adds a play line');
  assert(w.eval('(function(){ var n=activeDeck().lines.map(function(l){return l.name;}); return n.length===new Set(n).size; })()'), 'R7-B: added lines get a unique auto-name');
  assert(w.eval('activeDeck().activeLineId===activeDeck().lines[activeDeck().lines.length-1].id'), 'R7-B: a newly added line becomes active');
  d.querySelector('#planner .pl-line-chip').click(); await sleep(20);   // tap the first chip
  assert(w.eval('activeDeck().activeLineId===activeDeck().lines[0].id'), 'R7-B: tapping a line chip switches the active line');
  const _db = w.eval('activeDeck().lines.length');
  d.querySelector('#planner [data-pldupe]').click(); await sleep(20);
  assert(w.eval('activeDeck().lines.length')===_db+1, 'R7-B: Duplicate adds a copy of the active line');
  assert(w.eval('(function(){ var ls=activeDeck().lines; var copy=ls.find(function(l){return l.id===activeDeck().activeLineId;}); var src=ls[0]; copy.turns[0].push("ZZDEEP"); var leaked=src.turns[0].indexOf("ZZDEEP")>=0; copy.turns[0].pop(); return !leaked; })()'), 'R7-B: Duplicate deep-clones turns (mutating the clone never touches the source)');
  d.querySelector('#planner [data-plrename]').click(); await sleep(20);
  const _nameInput = d.querySelector('#planner [data-plname]');
  assert(_nameInput!==null, 'R7-B: Rename swaps the active chip for an inline input');
  _nameInput.value = 'My Combo'; _nameInput.dispatchEvent(new w.Event('blur')); await sleep(500);
  assert(w.eval('activeLine(activeDeck()).name')==='My Combo', 'R7-B: Rename commits the new name');
  const _lp = w.eval('(JSON.parse(localStorage.getItem("snapwb-decks")).decks.find(function(x){return x.id==="plr6";})||{}).lines');
  assert(Array.isArray(_lp) && _lp.some(function(l){return l.name==='My Combo';}), 'R7-B: the renamed line persists to storage');
  const _delB = w.eval('activeDeck().lines.length');
  d.querySelector('#planner [data-pldel]').click(); await sleep(20);   // w.confirm is stubbed true
  assert(w.eval('activeDeck().lines.length')===_delB-1, 'R7-B: Delete removes the active line');
  w.eval('(function(){ var dd=activeDeck(); materializeLines(dd); dd.lines=[dd.lines[0]]; dd.activeLineId=dd.lines[0].id; dd.line=dd.lines[0].turns; })(); renderDeck();'); await sleep(20);
  assert(d.querySelectorAll('#planner .pl-slot[data-t]').length===6, 'R7-B: the six turn slots are untouched by the manager bar');
  assert(d.querySelector('#planner [data-pldel]').disabled===true, 'R7-B: Delete is disabled when only one line remains');

  // --- C: line-plan read view (#lineplan above #decktabs) ---
  w.eval('(function(){ S.decks.unshift({id:"r7read",name:"R7 Read",cards:["Hulk","AntMan","Wong","Odin"],line:[["AntMan"],["Wong"],[],["Hulk"],[],[]],updated:Date.now()}); S.activeId="r7read"; })(); setTab("deck"); renderDeck();'); await sleep(20);
  assert(d.querySelector('#lineplan')!==null && d.querySelector('#view-deck > #lineplan')!==null, 'R7-C: #lineplan lives in the DOM as a direct child of #view-deck');
  const _nonEmpty = w.eval('currentLine(activeDeck()).filter(function(t){return t.length;}).length');
  assert(d.querySelectorAll('#lineplan .lp-row').length===_nonEmpty && _nonEmpty===3, 'R7-C: one .lp-row per non-empty turn (3 here)');
  assert(d.querySelectorAll('#lineplan .lp-chips .mini').length>0, 'R7-C: read-view turn chips render as .mini');
  assert(/⚡/.test(d.querySelector('#lineplan .lp-row .lp-energy').textContent), 'R7-C: each row shows per-turn energy (spent/budget⚡)');
  assert(d.querySelector('#lineplan .lp-conf')!==null && /draws/i.test(d.querySelector('#lineplan .lp-conf').textContent)
    && /%/.test(d.querySelector('#lineplan .lp-conf').title), 'R7-C/R9.5: draw-demand tier chip (raw % lives in the tooltip)');
  w.eval('(function(){ var dd=activeDeck(); materializeLines(dd); dd.lines.push(newLineObj("Aggro",[["Odin"],[],[],[],[],[]])); persistDecks(); })(); renderDeck();'); await sleep(20);
  assert(d.querySelectorAll('#lineplan .lp-seg button').length===w.eval('getLines(activeDeck()).length') && w.eval('getLines(activeDeck()).length')>=2, 'R7-C: the switcher shows one button per line (>=2 lines)');
  // no-plan invite
  w.eval('(function(){ S.decks.unshift({id:"r7noplan",name:"R7 NoPlan",cards:["Hulk","AntMan"],updated:Date.now()}); S.activeId="r7noplan"; })(); renderDeck();'); await sleep(20);
  assert(d.querySelector('#lineplan .lp-empty')!==null && d.querySelector('#lineplan #lp-plan-btn')!==null, 'R7-C: a deck with no plan shows the .lp-empty invite + Plan-it button');
  d.querySelector('#lineplan #lp-plan-btn').click(); await sleep(20);
  assert(w.eval('S.deckTab')==='planner', 'R7-C: Plan-it jumps to the planner sub-tab');
  // blank bench hides the read view
  w.eval('S.activeId=null; setTab("deck"); renderDeck();'); await sleep(20);
  assert(d.querySelector('#view-deck').classList.contains('no-deck') && d.querySelector('#lineplan').innerHTML==='', 'R7-C: a blank bench clears the read view (and .no-deck hides it)');
  assert(/#view-deck\.no-deck > :not\(#deck-empty\)\{display:none/.test(html), 'R7-C: the .no-deck CSS rule hides #lineplan (a direct child)');

  // --- C7: read-view switcher changes the active line + re-renders ---
  w.eval('S.activeId="r7read"; setTab("deck"); renderDeck();'); await sleep(20);
  const _segBtns = [...d.querySelectorAll('#lineplan .lp-seg button')];
  assert(_segBtns.length>=2, 'R7-C7: the read-view switcher is present with >=2 buttons');
  const _wasActive = w.eval('activeDeck().activeLineId');
  const _other = _segBtns.find(b => b.dataset.lid !== _wasActive);
  _other.click(); await sleep(20);
  assert(w.eval('activeDeck().activeLineId')===_other.dataset.lid && w.eval('activeDeck().activeLineId')!==_wasActive, 'R7-C7: tapping a switcher button changes the active line');
  assert(d.querySelector('#lineplan .lp-name').textContent===w.eval('activeLine(activeDeck()).name'), 'R7-C7: the read view re-renders to the newly active line');

  // --- C8: deckAsText appends the GAME PLAN block only when a plan exists ---
  w.eval('S.activeId="r7read";');
  assert(/GAME PLAN/.test(w.eval('deckAsText()')), 'R7-C8: deckAsText includes a GAME PLAN block when a plan exists');
  assert(/T\d:/.test(w.eval('deckAsText()')) && /—/.test(w.eval('deckAsText()')), 'R7-C8: the GAME PLAN lists named lines with per-turn rows');
  w.eval('S.activeId="r7noplan";');
  assert(!/GAME PLAN/.test(w.eval('deckAsText()')) && /Hulk/.test(w.eval('deckAsText()')), 'R7-C8: deckAsText has no GAME PLAN when there is no plan (but still lists cards)');

  // --- C9: regression — six slots + picker force-close on leaving the planner sub-tab ---
  w.eval('S.activeId="r7read"; setTab("deck"); setDeckTab("planner"); renderDeck();'); await sleep(20);
  assert(d.querySelectorAll('#planner .pl-slot[data-t]').length===6, 'R7-C9: composer still renders six turn slots');
  d.querySelector('#planner .pl-slot[data-t="1"]').click(); await sleep(20);
  assert(d.querySelector('#pl-picker').classList.contains('on'), 'R7-C9: the picker opens on the planner tab');
  w.eval('setDeckTab("overview")'); await sleep(20);
  assert(!d.querySelector('#pl-picker').classList.contains('on') && w.eval('S.plannerTurn')===null, 'R7-C9: leaving the planner sub-tab force-closes the picker');
  // cleanup R7 fixtures + restore a normal active deck for the remaining round-5/6 suite
  w.eval('S.decks = S.decks.filter(function(x){return ["r7read","r7noplan"].indexOf(x.id)<0;}); S.activeId="plr6"; setTab("deck"); renderDeck();'); await sleep(20);

  // --- G: card-change flags (snapshot / diff / dot / banner / dismiss) ---
  w.eval('(function(){ const ids=S.db.slice(0,3).map(c=>c.d); S.decks.unshift({id:"gflag",name:"G Flag",cards:ids,updated:Date.now()}); S.activeId="gflag"; snapshotDeck(activeDeck()); })()');
  await sleep(10);
  assert(w.eval('deckChanges(activeDeck()).length')===0, 'G: a freshly snapshotted deck reports no changes');
  const _bumpId = w.eval('S.decks.find(x=>x.id==="gflag").cards[0]');
  await w.eval('applyDb(S.db.map(c=> c.d==='+JSON.stringify(_bumpId)+' ? Object.assign({},c,{p:c.p+3}) : c))');
  await sleep(20);
  const _ch = w.eval('deckChanges(S.decks.find(x=>x.id==="gflag"))');
  assert(_ch.length===1 && _ch[0].now.p===_ch[0].was.p+3 && _ch[0].pow===true, 'G: deckChanges reports the mocked +3 power bump');
  assert(w.eval('deckHasChanges(S.decks.find(x=>x.id==="gflag"))')===true, 'G: deckHasChanges true after the DB change');
  w.eval('setTab("saved")'); await sleep(20);
  assert(d.querySelector('#savedlist .saverow .sv-dot')!==null, 'G: the changed deck shows an unread dot on its Saved row');
  w.eval('S.activeId="gflag"; setTab("deck")'); await sleep(20);
  assert(/→/.test(d.querySelector('#deckchanges').textContent), 'G: the "what changed" banner shows the power arrow (→)');
  d.querySelector('#ch-dismiss').click(); await sleep(20);
  assert(w.eval('deckHasChanges(activeDeck())')===false, 'G: Dismiss re-snapshots so there are no more changes');
  assert(d.querySelector('#deckchanges').textContent==='', 'G: the banner clears after dismiss');
  const _snapStub = w.eval('(function(){ const dd={id:"gstub",name:"S",cards:["ZzNope2099"],updated:Date.now()}; makeStub("ZzNope2099"); snapshotDeck(dd); return deckChanges(dd).length; })()');
  assert(_snapStub===0, 'G: stub cards (absent from the DB) never false-flag');

  // --- H: meta context (per-deck note + coach digest) ---
  w.eval('(function(){ S.decks.unshift({id:"hmeta",name:"H Meta",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="hmeta"; })()');
  w.eval('S.creatorDecks=[{creator:"Alpha",video:"v1",url:"",published:"2026-07-01",name:"",ids:["Hulk","AntMan"],untapped:""},{creator:"Beta",video:"v2",url:"",published:"2026-07-02",name:"Beta Deck",ids:["Hulk","AntMan","Wong"],untapped:""}]');
  const _mn = w.eval('deckMetaNote(activeDeck())');
  assert(_mn && _mn.inMeta===3 && _mn.total===4, 'H: deckMetaNote counts cards appearing in creator decks (3 of 4)');
  assert(_mn.overlap===3 && _mn.closest && _mn.closest.creator==='Beta', 'H: closest = the higher-overlap creator deck (Beta, 3 shared)');
  const _dig = w.eval('creatorMetaDigest()');
  assert(_dig.length>0 && /Most-played cards/.test(_dig) && /×/.test(_dig), 'H: creatorMetaDigest non-empty with archetypes (×) + most-played cards');
  w.eval('S.creatorDecks=[]');
  assert(w.eval('deckMetaNote(activeDeck())')===null && w.eval('creatorMetaDigest()')==='', 'H: empty creator meta -> null note + empty digest');
  w.eval('S.creatorDecks=[{creator:"Beta",video:"v2",url:"",published:"2026-07-02",name:"Beta Deck",ids:["Hulk","AntMan","Wong"],untapped:""}]; setTab("deck"); renderDeck();'); await sleep(20);
  assert(/creator decks/.test(d.querySelector('#deckmeta').textContent), 'H: #deckmeta renders the overlap note when creator decks exist');
  // coach prompt splices the digest in (capture the request body via a fetch swap)
  await w.eval('(async()=>{ const of=window.fetch; let cap=null; window.fetch=async(u,o)=>{ cap=o; return { ok:true, json:async()=>({content:[{type:"text",text:"ok"}]}) }; }; setTab("ai"); document.getElementById("btn-ask").click(); await new Promise(r=>setTimeout(r,60)); window.__coachCap=cap; window.fetch=of; })()');
  const _capBody = w.eval('window.__coachCap && window.__coachCap.body');
  assert(_capBody && /creator meta/i.test(_capBody), 'H: coach prompt includes the creator-meta digest block');

  // ============ WP3 round-5: cross-device sync (I) + in-app Add-creator (J) ============
  // --- I: mergeState — newest-wins per deck, union owned/creators, never drop local ---
  const _local = { v:1, updatedAt:1000,
    decks:[{id:'A',updated:5,cards:['Hulk']},{id:'B',updated:5,cards:['AntMan']}],
    activeId:'A', owned:['Hulk'], creators:[{id:'UC1',name:'One'}], prefs:{density:'cmp'} };
  const _remote = { v:1, updatedAt:2000,
    decks:[{id:'A',updated:9,cards:['Hulk','Wong']},{id:'C',updated:3,cards:['Odin']}],
    activeId:'C', owned:['AntMan','Odin'], creators:[{id:'UC2',name:'Two'}], prefs:{density:'det'} };
  const _m = w.eval('mergeState('+JSON.stringify(_local)+','+JSON.stringify(_remote)+')');
  const _mA = _m.decks.find(x => x.id==='A');
  assert(_mA && _mA.cards.length===2 && _mA.cards.indexOf('Wong')>=0, 'I: newer remote deck overrides same-id local');
  assert(_m.decks.some(x => x.id==='B'), 'I: local-only deck survives merge (never dropped)');
  assert(_m.decks.some(x => x.id==='C'), 'I: remote-only deck is added');
  assert(_m.owned.length===3 && _m.owned.indexOf('Odin')>=0 && _m.owned.indexOf('Hulk')>=0, 'I: owned sets are unioned');
  assert(_m.creators.length===2, 'I: creators unioned by id');
  assert(_m.prefs.density==='det', 'I: newer updatedAt wins for prefs');
  assert(_m.activeId==='A', 'I: activeId preserved when its deck survives');
  const _m2 = w.eval('mergeState({decks:[{id:"A",updated:20,cards:["X"]}],owned:[],creators:[],prefs:{},updatedAt:5},{decks:[{id:"A",updated:9,cards:["Y"]}],owned:[],creators:[],prefs:{},updatedAt:1})');
  assert(_m2.decks[0].cards[0]==='X', 'I: newer LOCAL deck is kept over an older remote same-id');
  assert(w.eval('mergeState({decks:[{id:"Z",updated:1,cards:[]}],owned:["Hulk"],creators:[],prefs:{},updatedAt:1}, null).decks.length')===1, 'I: mergeState with null remote returns local unchanged');

  // --- I: buildStateBlob shape + import round-trip via mergeState/applyStateBlob (no FileReader) ---
  const _blob = w.eval('buildStateBlob()');
  assert(_blob && Array.isArray(_blob.decks) && Array.isArray(_blob.owned) && _blob.prefs && typeof _blob.updatedAt==='number', 'I: buildStateBlob carries decks/owned/prefs/updatedAt');
  const _before = w.eval('S.decks.length');
  const _importBlob = { v:1, updatedAt:Date.now()+100000,
    decks:[{id:'imp-1',name:'Imported',cards:['Hulk','AntMan'],updated:Date.now()+100000}],
    activeId:'imp-1', owned:['ZzImport1'], creators:[], prefs:{} };
  w.eval('applyStateBlob(mergeState(buildStateBlob(), '+JSON.stringify(_importBlob)+'))');
  assert(w.eval('S.decks.some(x=>x.id==="imp-1")'), 'I: import merges a new deck (no clobber)');
  assert(w.eval('S.decks.length')>=_before+1, 'I: import never drops existing local decks');
  assert(w.eval('S.owned.has("ZzImport1")'), 'I: import unions owned cards');

  // --- I: syncPush issues a PUT with the Bearer header; token never in the URL ---
  await w.eval('(async()=>{ const of=window.fetch; window.__cap=null; window.fetch=async(u,o)=>{ window.__cap={u:String(u),o:o}; return {ok:true,status:200,json:async()=>({}),text:async()=>"{}"}; }; S.syncToken="tok-secret-123"; await syncPush(); window.fetch=of; })()');
  const _cap = w.eval('window.__cap');
  assert(_cap && _cap.o.method==='PUT', 'I: syncPush issues a PUT');
  assert(_cap.o.headers.authorization==='Bearer tok-secret-123', 'I: syncPush sends the token as an Authorization: Bearer header');
  assert(_cap.u===w.eval('SYNC_URL') && !/tok-secret-123/.test(_cap.u), 'I: syncPush targets SYNC_URL and never puts the token in the URL');
  assert(Array.isArray(JSON.parse(_cap.o.body).decks), 'I: syncPush body is a full state blob');
  assert(w.eval('S.syncState')==='ok', 'I: a successful push sets syncState=ok');

  // --- I: syncPull is a GET with the Bearer header and merges the remote blob ---
  const _pullRemote = { v:1, updatedAt:Date.now()+200000,
    decks:[{id:'pull-1',name:'Pulled',cards:['Wong'],updated:Date.now()+200000}],
    activeId:'pull-1', owned:['Wong'], creators:[], prefs:{} };
  await w.eval('(async()=>{ const of=window.fetch; window.__pcap=null; window.fetch=async(u,o)=>{ window.__pcap={u:String(u),o:o||{}}; return {ok:true,status:200,json:async()=>('+JSON.stringify(_pullRemote)+'),text:async()=>""}; }; S.syncToken="tok-secret-123"; await syncPull(); window.fetch=of; })()');
  const _pcap = w.eval('window.__pcap');
  assert(_pcap && (!_pcap.o.method || _pcap.o.method==='GET'), 'I: syncPull uses GET');
  assert(_pcap.o.headers.authorization==='Bearer tok-secret-123' && !/tok-secret-123/.test(_pcap.u), 'I: syncPull sends the Bearer header, never the token in the URL');
  assert(w.eval('S.decks.some(x=>x.id==="pull-1")'), 'I: syncPull merges the remote blob into local decks');
  w.eval('S.syncToken="";');   // restore unconfigured state so later persists/AI stay offline-clean

  // --- I: token saved via Settings persists to K.synctoken and never leaks into a URL ---
  w.eval('document.getElementById("btn-settings").onclick()'); await sleep(20);
  assert(d.querySelector('#sync-token')!==null && d.querySelector('#sync-save')!==null, 'I: Settings exposes the sync token field + Save');
  assert(d.querySelector('#data-export')!==null && d.querySelector('#data-import')!==null, 'I: Settings exposes Export/Import backup controls');
  d.querySelector('#sync-token').value='ui-token-777';
  await w.eval('(async()=>{ const of=window.fetch; window.__ucap=[]; window.fetch=async(u,o)=>{ window.__ucap.push(String(u)); return {ok:true,status:200,json:async()=>({}),text:async()=>"{}"}; }; document.getElementById("sync-save").onclick(); await new Promise(r=>setTimeout(r,120)); window.fetch=of; })()');
  assert(w.eval('S.syncToken')==='ui-token-777', 'I: Save token updates S.syncToken');
  assert(/ui-token-777/.test(w.localStorage.getItem('snapwb-synctoken')||''), 'I: saved token persists to K.synctoken in localStorage');
  assert(!/ui-token-777/.test(w.eval('JSON.stringify(window.__ucap)')), 'I: token never appears in any relay URL string');
  w.eval('closeModal(); S.syncToken="";');

  // --- J: extractDecksFromDesc reuses parseCode to decode BOTH a base64 code and an untapped slug ---
  const _dcode = Buffer.from(JSON.stringify({Name:'MockDeck',Cards:SLUGIDS.map(id=>({CardDefId:id}))})).toString('base64');
  const _slugUrl = 'https://snap.untapped.gg/en/decks/'+SLUGIDS.join('-')+'_DualDeck';
  const _desc = 'Line one\n'+_dcode+'\nWatch here '+_slugUrl+' thanks';
  const _dd = w.eval('extractDecksFromDesc('+JSON.stringify(_desc)+')');
  assert(_dd.length===2 && _dd.every(x=>x.ids.length===12), 'J: extractDecksFromDesc decodes both a base64 code and an untapped slug');

  // --- J: addCreator harvests a mocked feed, tags decks, persists, renders + Remove ---
  const _mockUC = 'UCmocktuber000000000001';
  const _pubRecent = new Date(Date.now()-2*86400000).toISOString();
  const MOCK_RSS = '<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">'+
    '<yt:channelId>'+_mockUC+'</yt:channelId><title>MockTuber Channel</title>'+
    '<author><name>MockTuber</name><uri>https://www.youtube.com/@mocktuber</uri></author>'+
    '<entry><title>Best Deck Ever</title>'+
    '<link rel="alternate" href="https://www.youtube.com/watch?v=mock123"/>'+
    '<published>'+_pubRecent+'</published>'+
    '<media:group><media:description>My deck code:\n'+_dcode+'\nGGs</media:description></media:group>'+
    '</entry></feed>';
  w.eval('S.addedCreators=[]; S.addedCreatorDecks=[];');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(MOCK_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===1, 'J: addCreator harvests one deck from the mocked feed');
  assert(w.eval('S.addedCreatorDecks[0].added')===true && w.eval('S.addedCreatorDecks[0].ids.length')===12, 'J: added deck is tagged added:true and decodes 12 ids');
  assert(w.eval('S.addedCreators.some(c=>c.id==="'+_mockUC+'")'), 'J: the channel UC id is recorded on S.addedCreators');
  await sleep(500);
  const _crPersist = w.eval('JSON.parse(localStorage.getItem("snapwb-creators")||"null")');
  assert(_crPersist && _crPersist.decks && _crPersist.decks.length===1, 'J: added creators persist to K.creators');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(30);
  assert(d.querySelector('#cr-add-btn')!==null, 'J: Creator segment shows the + Add creator button');
  const _addedRow = [...d.querySelectorAll('#creatorlist .crow')].find(r => r.querySelector('.cr-added'));
  assert(_addedRow, 'J: the added deck renders a row with an "Added" badge');
  assert(_addedRow.querySelector('.abtn.danger')!==null, 'J: added rows carry a Remove button');
  assert(_addedRow.querySelector('.abtn.primary')!==null, 'J: added decks still offer Save a copy');
  d.querySelector('#cr-add-btn').click(); await sleep(20);
  assert(d.querySelector('#cr-url')!==null && d.querySelector('#cr-fetch')!==null, 'J: Add-creator modal has a URL field + Fetch button');
  w.eval('closeModal()');
  _addedRow.querySelector('.abtn.danger').click(); await sleep(20);
  assert(w.eval('S.addedCreatorDecks.length')===0 && w.eval('S.addedCreators.length')===0, 'J: Remove clears the channel and its decks');

  // --- J: failure paths — bad URL (worker 400) and out-of-window videos add nothing ---
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:false,status:400,json:async()=>({error:"not a resolvable YouTube channel URL/handle/UC id"}),text:async()=>""}); await addCreator("https://example.com/not-youtube"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===0 && w.eval('S.addedCreators.length')===0, 'J: a bad/non-YouTube URL (worker 400) adds nothing');
  const OLD_RSS = MOCK_RSS.replace(_pubRecent, new Date(Date.now()-30*86400000).toISOString());
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(OLD_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===0, 'J: videos older than the 14-day window add no decks');
  // R8: with the modal open, failures land in #cr-msg (visible, named channel) instead of a vanishing toast
  w.eval('openAddCreator()'); await sleep(10);
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(OLD_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  const crMsg = d.querySelector('#cr-msg');
  assert(crMsg && crMsg.style.display!=='none' && /Found .+no Snap deck codes/.test(crMsg.textContent), 'R8: no-codes failure names the channel in the modal ('+(crMsg?crMsg.textContent.slice(0,40):'')+')');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:false,status:502,json:async()=>({error:"feed returned 502"}),text:async()=>""}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(/Couldn’t reach|Couldn’t reach/.test(d.querySelector('#cr-msg').textContent), 'R8: unreachable-channel failure shows the retry-later message');
  w.eval('closeModal()');
  w.eval('setTab("cards")'); await sleep(10);

  // ============ R6 WP1: draft lifecycle · blank bench · empty states · connective flow · sync safety ============
  // item 1: a blank draft is hidden from Saved AND the sync push; its first card promotes it
  w.eval('S.decks = S.decks.filter(x=>!isDraft(x)); S.activeId=null; S.syncToken="";'); await sleep(10);
  w.eval('setTab("saved"); document.getElementById("btn-newdeck").onclick();'); await sleep(20);
  const _draftId = w.eval('S.activeId');
  assert(w.eval('isDraft(activeDeck())')===true, 'R6: "+ New deck" creates a blank DRAFT (isDraft true)');
  assert(w.eval('activeDeck().name')==='', 'R6: a draft is created with a blank name (not "New Deck")');
  w.eval('setTab("saved")'); await sleep(20);
  assert(d.querySelectorAll('#savedlist .saverow').length===w.eval('S.decks.filter(x=>!isDraft(x)).length'), 'R6: Saved lists exactly the non-draft decks (the draft is hidden)');
  assert(w.eval('pushableBlob().decks.some(x=>x.id==='+JSON.stringify(_draftId)+')')===false, 'R6: pushableBlob() excludes the blank draft (sync push stays draft-free)');
  assert(w.eval('buildStateBlob().decks.some(x=>x.id==='+JSON.stringify(_draftId)+')')===true, 'R6: buildStateBlob() stays FULL so a local draft survives local merges');
  w.eval('setTab("cards"); toggleCard(S.db[0].d);'); await sleep(20);
  assert(w.eval('isDraft(activeDeck())')===false, 'R6: adding the first card auto-promotes the draft to a real deck');
  assert(w.eval('pushableBlob().decks.some(x=>x.id==='+JSON.stringify(_draftId)+')')===true, 'R6: the promoted deck now rides the sync push');
  w.eval('setTab("saved")'); await sleep(20);
  assert([...d.querySelectorAll('#savedlist .saverow')].some(r=>r.querySelector('.sv-main')) && d.querySelectorAll('#savedlist .saverow').length===w.eval('S.decks.filter(x=>!isDraft(x)).length'), 'R6: the promoted deck now appears on the Saved shelf');

  // item 3: no-active-deck empty states — Deck pane, coach guard, export guard (no throws)
  w.eval('S.decks = S.decks.filter(x=>x.id!=='+JSON.stringify(_draftId)+'); S.activeId=null; renderAll();'); await sleep(20);
  assert(w.eval('activeDeck()')===null, 'R6: the bench is blank (activeDeck() null)');
  const _errBase = errors.length;
  w.eval('setTab("deck")'); await sleep(20);
  assert(d.querySelector('#deck-empty') && d.querySelector('#deck-empty').hidden===false, 'R6: Deck tab reveals #deck-empty on a blank bench');
  assert(d.querySelector('#view-deck').classList.contains('no-deck'), 'R6: #view-deck gets .no-deck (hides the showcase modules, keeps #decktabs in the DOM)');
  assert(d.querySelector('#decktabs')!==null && d.querySelector('.dpane[data-pane="overview"]')!==null, 'R6: #decktabs/.dpane remain in the DOM for structural tests');
  assert(d.querySelector('#de-build')!==null && d.querySelector('#de-saved')!==null, 'R6: empty state offers Build + Open Saved actions');
  w.eval('renderAll()'); await sleep(10);
  assert(errors.length===_errBase, 'R6: renderAll() with no active deck throws nothing');
  w.eval('setTab("ai"); document.getElementById("btn-ask").click();'); await sleep(40);
  assert(errors.length===_errBase, 'R6: Ask coach with no active deck does not throw (fixes the latent activeDeck().name crash)');
  assert(/bench first/i.test(d.querySelector('#aiout').textContent), 'R6: coach shows the "put a deck on the bench first" guard message');
  await w.eval('doCopyCode()'); await sleep(10);
  assert(errors.length===_errBase, 'R6: doCopyCode() with no active deck does not throw (guarded)');

  // item 4: Saved row body -> read-only showcase (Overview) -> Edit cards -> Build; pencil -> Build
  w.eval('(function(){ S.decks.unshift({id:"r6view",name:"R6 View",cards:S.db.slice(0,4).map(c=>c.d),done:true,updated:Date.now()}); S.activeId=null; renderAll(); })()'); await sleep(10);
  w.eval('setTab("saved")'); await sleep(20);
  const _vrow = [...d.querySelectorAll('#savedlist .saverow')].find(r => /R6 View/.test(r.querySelector('.sv-name').textContent));
  assert(_vrow, 'R6: the seeded deck shows on the Saved shelf');
  _vrow.querySelector('.sv-main').click(); await sleep(20);
  assert(w.eval('S.tab')==='deck' && w.eval('S.activeId')==='r6view', 'R6: tapping the row body opens the Deck showcase for that deck');
  assert(w.eval('S.deckTab')==='overview', 'R6: the showcase lands on the Overview sub-tab');
  assert(w.eval('S.decks.find(x=>x.id==="r6view").done')===true, 'R6: viewing a deck does NOT flip done (read-only showcase)');
  d.querySelector('#btn-editcards').click(); await sleep(20);
  assert(w.eval('S.tab')==='cards' && w.eval('S.activeId')==='r6view', 'R6: the Edit-cards CTA jumps to Build with the same deck active');
  w.eval('setTab("saved")'); await sleep(20);
  const _vrow2 = [...d.querySelectorAll('#savedlist .saverow')].find(r => /R6 View/.test(r.querySelector('.sv-name').textContent));
  _vrow2.querySelector('.sv-btn.edit').click(); await sleep(20);
  assert(w.eval('S.tab')==='cards' && w.eval('S.activeId')==='r6view', 'R6: the pencil quick-edit also jumps straight to Build');

  // item 6: sync merge tolerates drafts — push filters them; a local draft survives applyStateBlob(mergeState(...))
  w.eval('(function(){ S.decks.unshift({id:"r6draft",name:"",cards:[],updated:Date.now()}); S.activeId="r6draft"; })()');
  assert(w.eval('isDraft(S.decks.find(x=>x.id==="r6draft"))')===true, 'R6: seeded a live blank draft on the bench');
  await w.eval('(async()=>{ const of=window.fetch; window.__r6cap=null; window.fetch=async(u,o)=>{ window.__r6cap={o:o}; return {ok:true,status:200,json:async()=>({}),text:async()=>"{}"}; }; S.syncToken="tok-r6"; await syncPush(); window.fetch=of; S.syncToken=""; })()');
  const _r6body = w.eval('JSON.parse(window.__r6cap.o.body)');
  assert(_r6body.decks.every(x=>x.id!=="r6draft"), 'R6: the syncPush body (pushableBlob) excludes the live draft');
  assert(_r6body.decks.some(x=>x.id==="r6view"), 'R6: the syncPush body still carries the real decks');
  const _r6remote = { v:1, updatedAt:Date.now()+50000, decks:[{id:"r6remote",name:"Remote",cards:["Hulk"],updated:Date.now()+50000}], activeId:"r6remote", owned:[], creators:[], prefs:{} };
  w.eval('applyStateBlob(mergeState(buildStateBlob(), '+JSON.stringify(_r6remote)+'))'); await sleep(10);
  assert(w.eval('S.decks.some(isDraft)')===true, 'R6: a local draft survives applyStateBlob(mergeState(...)) (never dropped mid-session)');
  assert(w.eval('S.decks.some(x=>x.id==="r6remote")')===true, 'R6: the remote deck merges in alongside the surviving local draft');
  // restore a real active deck so the final AI-mocked assertion has a deck on the bench
  w.eval('S.decks = S.decks.filter(x=>!isDraft(x)); if(!activeDeck()) S.activeId=(S.decks[0]||{}).id||null; S.syncToken="";'); await sleep(10);

  // ============ R6 WP2: showcase Deck tab — art hero + keycard spotlight + header band ============
  w.eval('(function(){ S.decks.unshift({id:"r6show",name:"R6 Show",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="r6show"; })(); setTab("deck"); renderDeck();'); await sleep(20);
  assert(d.querySelector('#decklist').classList.contains('hero'), 'R6-D: the showcase deck grid is the art-forward .hero');
  assert(d.querySelectorAll('#decklist .mini').length===12, 'R6-D: hero grid still renders 12 mini slots');
  const _keyN = d.querySelectorAll('#decklist .mini.keycard').length;
  assert(_keyN>=1 && _keyN<=2, 'R6-D: 1-2 finishers spotlit with .keycard (max-cost card[s])');
  const _keyIds = [...d.querySelectorAll('#decklist .mini.keycard')].map(m=>m.getAttribute('data-d'));
  assert(_keyIds.indexOf('AntMan')<0, 'R6-D: the 1-cost card is never spotlit as a finisher');
  assert(d.querySelector('.deck-hero-head #deckname')!==null && d.querySelector('.deck-hero-head #verdictrow')!==null, 'R6-D: header band groups the title + verdict control');
  assert(d.querySelector('#deckglance #st-count').textContent==='4/12', 'R6-D: the glance stat strip counts the deck');
  assert(/\.minigrid\.hero\{grid-template-columns:repeat\(4,1fr\)/.test(html) && /\.minigrid\.hero\{grid-template-columns:repeat\(6,1fr\)/.test(html),
    'R6-D: hero grid is 4-col on phone / 6-col on desktop');
  assert(d.querySelector('#view-deck').classList.contains('no-deck')===false, 'R6-D: an active deck clears the empty-state .no-deck flag');

  // AI mocked
  w.eval('setTab("ai")'); d.querySelector('#btn-ask').click(); await sleep(80);
  assert(d.querySelector('#aiout').textContent.includes('mock coach reply'), 'AI flow works');

  // ============ R6 review fixes: compare filter, Editing eyebrow, 44px picker Done, blank bench survives reload ============
  // MINOR 4: a transient blank draft never appears in the compare dropdown
  w.eval('(function(){ S.decks.unshift({id:"r6fixdraft",name:"",cards:[],updated:Date.now()}); S.activeId="r6fixdraft"; renderAll(); })()'); await sleep(20);
  assert(d.querySelector('#bh-mode').textContent==='', 'R6 fix: a blank draft on the bench shows no "Editing" eyebrow');
  w.eval('openCompare()'); await sleep(20);
  assert([...d.querySelectorAll('#cmp-a option')].every(o=>o.value!=='r6fixdraft'), 'R6 fix: compare dropdown excludes a live blank draft');
  assert(d.querySelectorAll('#cmp-a option').length>=2, 'R6 fix: compare dropdown still lists the real decks');
  w.eval('closeModal()'); await sleep(10);
  // MINOR 3: Build header names the mode for a real deck (pairs with the showcase "Viewing" eyebrow)
  w.eval('S.decks = S.decks.filter(x=>x.id!=="r6fixdraft"); S.activeId="r6show"; renderAll();'); await sleep(20);
  assert(d.querySelector('#bh-mode').textContent==='Editing' && d.querySelector('#bh-name').textContent==='R6 Show',
    'R6 fix: Build header reads "Editing" + the deck name for a real active deck');
  // MINOR 2: the picker Done button meets the 44px tap target
  assert(/\.pl-pick-done\{[^}]*min-height:44px/.test(html), 'R6 fix: play-line picker Done button is a 44px tap target');

  // MINOR 1: a deliberately blank bench (post-Done) survives an app reload when sync pulls at boot.
  // mergeState alone WOULD resurrect a deck (frozen behavior) — the boot-side guard undoes it.
  const _bootRemote = { v:1, updatedAt:9999999999999, decks:[{id:'r6boot-b',name:'Boot B',cards:['Wong'],updated:9999999999999}], activeId:'r6boot-b', owned:[], creators:[], prefs:{} };
  assert(w.eval('mergeState({decks:[{id:"x",updated:1}],activeId:null,owned:[],creators:[],prefs:{}}, '+JSON.stringify(_bootRemote)+').activeId')==='r6boot-b',
    'R6 fix (context): mergeState alone resurrects an activeId onto a blank bench');
  await sleep(450);   // flush pending debounced saves so the seeded storage below is exactly what boot reads
  w.eval('(function(){'+
    'localStorage.setItem("snapwb-decks", JSON.stringify({decks:[{id:"r6boot-a",name:"Boot A",cards:["Hulk"],updated:1000}],activeId:null}));'+
    'localStorage.setItem("snapwb-synctoken", JSON.stringify("tok-boot"));'+
    '})()');
  await w.eval('(async()=>{ const of=window.fetch; const blob='+JSON.stringify(_bootRemote)+';'+
    ' window.fetch=async()=>({ok:true,status:200,json:async()=>blob,text:async()=>JSON.stringify(blob)});'+
    ' await boot(); window.fetch=of; })()'); await sleep(30);
  assert(w.eval('S.activeId')===null, 'R6 fix: a blank bench stays blank across an app reload with sync configured');
  assert(w.eval('S.decks.some(x=>x.id==="r6boot-b") && S.decks.some(x=>x.id==="r6boot-a")')===true,
    'R6 fix: the reload-merged decks all land in Saved (nothing lost, just not on the bench)');
  assert(d.querySelector('#bh-name').textContent==='New deck' && d.querySelector('#bh-mode').textContent==='',
    'R6 fix: post-reload blank bench header reads "New deck" with no eyebrow');
  w.eval('S.syncToken=""; localStorage.removeItem("snapwb-synctoken");');

  // ============ ROUND 7 WP2: tokens (D) + energy nudge (E) ============
  // reset to the real embedded DB + seed tokens so producers/costs resolve (earlier tests left S.db mutated)
  w.eval('S.db=DB_BASE.slice(); indexDb(); applyTokenData();'); await sleep(10);

  // --- 11: getCard resolves token ids to a def with token:true ---
  assert(w.eval('Object.keys(S.tokens).length')>=15, 'R7-D11: TOKEN_SEED populates S.tokens (>=15 tokens)');
  assert(w.eval('!!getCard("Squirrel") && getCard("Squirrel").token===true && getCard("Squirrel").n==="Squirrel"'),
    'R7-D11: getCard(tokenId) returns a def with token===true (real name/cost/power/art)');
  assert(w.eval('getCard("Demon").c===1 && getCard("Demon").p===6'), 'R7-D11: token def carries curated cost/power');

  // --- 12: tokens are OFFERED in the picker only after their producer sits on an earlier turn ---
  w.eval('(function(){ S.decks.unshift({id:"r7tok",name:"Tok",cards:["SquirrelGirl","Hulk","AntMan","Wong"],updated:Date.now()}); S.activeId="r7tok"; mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],["SquirrelGirl"],[],[],[],[]]; }); })(); setTab("deck"); setDeckTab("planner"); renderDeck();'); await sleep(20);
  w.eval('openPlPicker(1)'); await sleep(20);
  assert(d.querySelectorAll('#pl-picker .pl-pick .mini.token').length===0, 'R7-D12: no tokens offered on T1 (producer sits on T2, not before)');
  w.eval('openPlPicker(2)'); await sleep(20);
  assert(d.querySelectorAll('#pl-picker .pl-pick .mini.token').length===0, 'R7-D12: no tokens offered on T2 (producer is ON T2, not strictly earlier)');
  assert(d.querySelectorAll('#pl-picker .pl-pick .mini').length===w.eval('activeDeck().cards.length'),
    'R7-D12: with no earlier producer the picker grid is exactly the deck (WP1 count invariant holds)');
  w.eval('openPlPicker(3)'); await sleep(20);
  const _tokTiles = [...d.querySelectorAll('#pl-picker .pl-pick .mini.token')];
  assert(_tokTiles.length===1 && _tokTiles[0].dataset.d==="Squirrel", 'R7-D12: T3 offers exactly the Squirrel token (SquirrelGirl -> Squirrel, on an earlier turn)');
  assert(d.querySelector('#pl-picker .pl-tok-head')!==null, 'R7-D12: offered tokens sit under a grouped "Tokens & summons" header');

  // --- 13: assigning a token counts energy but never touches the 12 ---
  d.querySelector('#pl-picker .pl-pick .mini.token[data-d="Squirrel"]').click(); await sleep(20);
  assert(w.eval('activeLine(activeDeck()).turns[2].indexOf("Squirrel")>=0'), 'R7-D13: tapping a token assigns it to that turn of the active line');
  assert(w.eval('currentLine(activeDeck())[2].reduce(function(s,id){return s+(getCard(id)||makeStub(id)).c;},0)')===1,
    'R7-D13: the token cost (Squirrel = 1) counts toward the turn energy');
  assert(w.eval('activeDeck().cards.length===4 && activeDeck().cards.indexOf("Squirrel")<0'),
    'R7-D13: the token is NOT added to the 12 (deck cards unchanged)');
  assert(d.querySelector('#st-count').textContent==='4/12', 'R7-D13: the deck count still reads 4/12 (tokens never touch #st-count)');

  // --- review fix 1/3: neither the card sheet nor toggleCard can smuggle a token into the 12 ---
  w.eval('toggleCard("Squirrel")'); await sleep(20);
  assert(w.eval('activeDeck().cards.length===4 && activeDeck().cards.indexOf("Squirrel")<0'),
    'R7-fix1: toggleCard refuses to ADD a token to the 12 (deck + export code stay clean)');
  w.eval('setDeckTab("planner"); renderDeck(); openCardSheet("Squirrel")'); await sleep(20);
  assert(d.querySelector('#sh-add')===null && d.querySelector('#sh-own')===null,
    'R7-fix1: the token card sheet offers no Add-to-deck / Mark-owned actions');
  const _tokSheetTxt = d.querySelector('#modal').textContent;
  assert(!/Series/.test(_tokSheetTxt) && /Token/.test(_tokSheetTxt),
    'R7-fix3: the token sheet shows a Token note instead of "Series undefined"');
  w.eval('closeModal(); openCardSheet("Hulk")'); await sleep(20);
  assert(d.querySelector('#sh-add')!==null && /Series/.test(d.querySelector('#modal').textContent),
    'R7-fix1: a REAL card sheet still offers Add/Owned + its Series line');
  w.eval('closeModal()'); await sleep(10);

  // --- 14: a token orphans automatically when its producer moves later / leaves the deck ---
  w.eval('mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],[],["Squirrel"],["SquirrelGirl"],[],[]]; })'); await sleep(10);
  assert(w.eval('currentLine(activeDeck())[2].indexOf("Squirrel")<0'), 'R7-D14: moving the producer to a LATER turn orphans the token (pruned from currentLine)');
  w.eval('mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],["SquirrelGirl"],["Squirrel"],[],[],[]]; })'); await sleep(10);
  assert(w.eval('currentLine(activeDeck())[2].indexOf("Squirrel")>=0'), 'R7-D14: with the producer back on an earlier turn the token is valid again');
  w.eval('(function(){ var dd=activeDeck(); dd.cards=["Hulk","AntMan","Wong","Odin"]; snapshotDeck(dd); })()'); await sleep(10);
  assert(w.eval('currentLine(activeDeck())[2].indexOf("Squirrel")<0'), 'R7-D14: removing the producer from the 12 also orphans its token');

  // --- 15: read-view token treatment + deckAsText marker ---
  w.eval('(function(){ S.decks.unshift({id:"r7tokread",name:"TokRead",cards:["SquirrelGirl","Hulk","AntMan","Wong"],updated:Date.now()}); S.activeId="r7tokread"; mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],["SquirrelGirl"],["Squirrel"],[],[],[]]; }); })(); setTab("deck"); renderDeck();'); await sleep(20);
  assert(d.querySelector('#lineplan .lp-chips .mini.token')!==null, 'R7-D15: the read view renders a created token as a distinct .token chip');
  assert(/\(token\)/.test(w.eval('deckAsText()')), 'R7-D15: deckAsText marks tokens with (token)');
  assert(/Squirrel Girl/.test(w.eval('deckAsText()')) && /GAME PLAN/.test(w.eval('deckAsText()')), 'R7-D15: the GAME PLAN block still lists the producer + turns');

  // --- 16: energy nudge math (explicit adj + auto ramp; explicit overrides ramp) ---
  assert(w.eval('lineFlags([[],[],["Wong"],[],[],[]],[0,0,0,0,0,0],activeDeck()).some(function(f){return f.type==="energy"&&f.turn===3;})'),
    'R7-E16: a 4-cost card on T3 with no nudge flags an energy overspend (spent 4 > budget 3)');
  assert(!w.eval('lineFlags([[],[],["Wong"],[],[],[]],[0,0,1,0,0,0],activeDeck()).some(function(f){return f.type==="energy"&&f.turn===3;})'),
    'R7-E16: adj[2]=+1 raises T3 budget to 4 -> no energy flag');
  assert(w.eval('budget({turns:[[],["Psylocke"],[],[],[],[]],adj:[0,0,0,0,0,0]},3,activeDeck())')===4,
    'R7-E16: a ramp card (Psylocke) on T2 auto-raises T3 budget to 4 with zero taps');
  assert(w.eval('budget({turns:[[],["Psylocke"],[],[],[],[]],adj:[0,0,2,0,0,0]},3,activeDeck())')===5,
    'R7-E16: an explicit adj[2] overrides the auto ramp value');
  assert(w.eval('budget({turns:[[],[],[],[],[],[]],adj:[0,0,0,0,0,0]},3,activeDeck())')===3, 'R7-E16: no ramp + no nudge -> budget is just t');
  assert(w.eval('budget({turns:[[],["Sunspot"],[],[],[],[]],adj:[0,0,0,0,0,0]},3,activeDeck())')===3,
    'R7-fix2: Sunspot ("Gain +1 Power for each unspent Energy") is NOT ramp — budget stays t');
  assert(w.eval('budget({turns:[[],["X23"],[],[],[],[]],adj:[0,0,0,0,0,0]},3,activeDeck())')===4,
    'R7-fix2: a real +1-Energy ramper (X-23) still auto-raises the next turn budget');

  // --- 17: nudge UI in the picker head adjusts adj[t-1], updates the budget, and persists ---
  w.eval('(function(){ S.decks.unshift({id:"r7nudge",name:"Nudge",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="r7nudge"; })(); setTab("deck"); setDeckTab("planner"); renderDeck(); openPlPicker(3);'); await sleep(20);
  const _plus = d.querySelector('#pl-nudge [data-nudge="1"]');
  assert(_plus!==null && d.querySelector('#pl-nudge [data-nudge="-1"]')!==null, 'R7-E17: the picker head shows a −/＋ nudge control');
  _plus.click(); await sleep(20);
  assert(w.eval('normAdj(activeLine(activeDeck()).adj)[2]')===1, 'R7-E17: tapping ＋ sets activeLine.adj[t-1] to +1');
  assert(/\/4⚡/.test(d.querySelector('#pl-picker-energy').textContent), 'R7-E17: the picker budget updates to reflect the nudge (0/4⚡)');
  await sleep(500);
  const _nAdj = w.eval('(function(){ var dk=JSON.parse(localStorage.getItem("snapwb-decks")).decks.find(function(x){return x.id==="r7nudge";}); var ln=(dk.lines||[]).find(function(l){return l.id===dk.activeLineId;})||(dk.lines||[])[0]; return ln?normAdj(ln.adj)[2]:null; })()');
  assert(_nAdj===1, 'R7-E17: the nudge persists to snapwb-decks storage');

  // --- 10: cards.json additive tokens/links parsing + seed fallback (kept LAST — it mutates S.db/S.tokens) ---
  const _mkCards = n => Array.from({length:n},(_,i)=>({n:'Site '+i,d:'Site'+i,c:i%7,p:i%13,a:'On Reveal: s'+i,s:'4'}));
  const _tokJson = { updated:'2026-07-10', cards:_mkCards(80), tokens:[{n:'ZTok',d:'ZTok',c:2,p:3},{n:'ZTok2',d:'ZTok2',c:1,p:1}], links:{ ZProd:['ZTok'] } };
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(_tokJson)+')}); window.__t1=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__t1')===true && w.eval('S.db.length')===80, 'R7-D10: a cards.json with a tokens key still loads the cards');
  assert(w.eval('!!S.tokens["ZTok"] && S.tokens["ZTok"].token===true'), 'R7-D10: the tokens key populates S.tokens');
  assert(w.eval('Array.isArray(S.tokenLinks["ZProd"]) && S.tokenLinks["ZProd"][0]==="ZTok"'), 'R7-D10: the links key populates S.tokenLinks');
  const _noTokJson = { updated:'2026-07-10', cards:_mkCards(80) };
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(_noTokJson)+')}); window.__t2=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__t2')===true && w.eval('!!S.tokens["Squirrel"] && Object.keys(S.tokens).length>=15'),
    'R7-D10: a tokenless cards.json falls back to the non-empty TOKEN_SEED');
  const _badTokJson = { updated:'2026-07-10', cards:_mkCards(80), tokens:'notanarray', links:42 };
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(_badTokJson)+')}); window.__t3=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__t3')===true && w.eval('!!S.tokens["Squirrel"]'), 'R7-D10: malformed tokens fall back to seed while cards still load');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({whatever:1})}); window.__t4=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__t4')===false, 'R7-D10: garbage cards.json still returns false (token intake is post-pass, non-fatal)');

  assert(errors.length===0, 'R7-D/E: no runtime errors during the token + nudge suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R9: meta stats ledger, coach synergy read, Plan B branching ============
  // stats loader: valid shape ingests; coach-shaped garbage is rejected
  const FAKE_STATS = { updated:'2026-07-10', windowDays:30, deckCount:60,
    cards:{ Hulk:31, AntMan:14, Wong:22 }, pairs:{ 'AntMan|Hulk':9 } };
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+JSON.stringify(FAKE_STATS)+')}); window.__s1=await loadCreatorStats(); window.fetch=of; })()');
  assert(w.eval('window.__s1')===true && w.eval('S.creatorStats.deckCount')===60, 'R9: loadCreatorStats ingests the ledger');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({text:"nope"})}); window.__s2=await loadCreatorStats(); window.fetch=of; })()');
  assert(w.eval('window.__s2')===false && w.eval('S.creatorStats.deckCount')===60, 'R9: malformed stats file is rejected, prior stats kept');
  // pair evidence prefers the deep ledger
  const statDeck = [{n:'Hulk',d:'Hulk',c:6,p:12,a:'',s:'1'},{n:'Ant-Man',d:'AntMan',c:1,p:1,a:'Ongoing: x',s:'1'}];
  const pev9 = w.eval('creatorPairEvidence('+JSON.stringify(statDeck)+')');
  assert(pev9.length===1 && pev9[0].n===9, 'R9: pair evidence reads the 30-day ledger (AntMan+Hulk seen 9x)');
  // meta check renders play-rate chips incl. a spice marker
  const spiceDeck = statDeck.concat([{n:'Homebrew Guy',d:'HomebrewGuy1',c:3,p:4,a:'',s:'5'}]);
  w.eval('renderSynergy('+JSON.stringify(spiceDeck)+')'); await sleep(10);
  assert(d.querySelectorAll('#synergy .mc-chip').length===3, 'R9: meta check renders one play-rate chip per deck card');
  assert(d.querySelector('#synergy .mc-chip.spice')!==null, 'R9: off-meta picks get the spice treatment');
  // coach synergy read: button -> mocked relay -> cached on deck -> rendered
  assert(w.eval('!!activeDeck()'), 'R9 precondition: a deck is on the bench');
  assert(d.querySelector('#syn-ai')!==null, 'R9: coach synergy button renders when relay configured');
  await w.eval('coachSynergy()'); await sleep(80);
  assert(w.eval('(activeDeck().synAI||{}).text')==='mock coach reply', 'R9: coach synergy result caches on the deck');
  assert(d.querySelector('#synergy .syn-ai-out')!==null && /mock coach reply/.test(d.querySelector('#synergy .syn-ai-out').textContent), 'R9: coach read renders in the pane');
  // Plan B branching: two lines, branch set, read-view pill switches lines
  w.eval('(function(){ const dd=activeDeck(); materializeLines(dd); if(dd.lines.length<2) dd.lines.push({id:"lnB",name:"Plan B",turns:[[],[],[],[],[],[]],adj:[0,0,0,0,0,0]}); dd.activeLineId=dd.lines[0].id; mutateActiveLine(dd, function(lo){ if(!lo.turns.some(function(t){return t.length;})) lo.turns[0]=[dd.cards[0]]; lo.branch={ifNot:dd.cards[0], byTurn:3, toLineId:dd.lines[1].id}; }); renderLinePlan(); })()'); await sleep(20);
  const bpill = d.querySelector('#lineplan .lp-branch');
  assert(bpill!==null && /Plan B: no .+ by T3/.test(bpill.textContent), 'R9: read view shows the Plan B pill');
  const preLid = w.eval('activeDeck().activeLineId');
  bpill.click(); await sleep(20);
  assert(w.eval('activeDeck().activeLineId')!==preLid, 'R9: tapping the Plan B pill switches to the fallback line');
  // confidence tiers carry a color class
  w.eval('(function(){ const dd=activeDeck(); dd.activeLineId="'+preLid+'"; mutateActiveLine(dd, function(lo){ if(!lo.turns.some(function(t){return t.length;})) lo.turns[0]=[dd.cards[0]]; }); renderLinePlan(); })()'); await sleep(20);
  const rc = d.querySelector('#lineplan .lp-conf');
  assert(rc!==null && /good|mid|low/.test(rc.className) && /draws/i.test(rc.textContent), 'R9.5: demand tier chip is worded + tiered (' + (rc?rc.className:'none') + ')');
  assert(d.querySelector('#lineplan .lp-t')!==null, 'R9.5: timeline turn nodes render');

  // R10.1: the Regis wipe — a sync pull must never eat freshly-added creator decks (union, not remote-wins)
  const mLoc = { v:1, updatedAt:2000, decks:[], owned:[], prefs:{},
    creators:[{id:'UCbt1SGMrWj5Q7TMXAfmTERQ', name:'RegisKillbin'}],
    creatorDecksCache:[{chId:'UCbt1SGMrWj5Q7TMXAfmTERQ', creator:'RegisKillbin', video:'v', url:'https://youtu.be/x', published:'2026-07-10', name:'Rama-Tut', ids:['Wong'], added:true}] };
  const mRem = { v:1, updatedAt:1000, decks:[], owned:[], prefs:{}, creators:[], creatorDecksCache:[] };
  const mOut = w.eval('mergeState('+JSON.stringify(mLoc)+','+JSON.stringify(mRem)+')');
  assert(mOut.creatorDecksCache.length===1 && mOut.creatorDecksCache[0].name==='Rama-Tut', 'R10.1: pull merge keeps locally-added creator decks (the Regis wipe)');
  const mOut2 = w.eval('mergeState('+JSON.stringify(mRem)+','+JSON.stringify(mLoc)+')');
  assert(mOut2.creatorDecksCache.length===1, 'R10.1: merge unions creator decks in both directions');
  // R10.1: protocol-less channel URLs are forgiven app-side
  const seenUrl = await w.eval('(async()=>{ let hit=""; const of=window.fetch; window.fetch=async(u,o)=>{ hit=String(u); return {ok:false,status:400,json:async()=>({error:"x"}),text:async()=>""}; }; await addCreator("youtube.com/@RegisKillbin"); window.fetch=of; return hit; })()');
  assert(/url=https%3A%2F%2Fyoutube\.com%2F%40RegisKillbin/.test(seenUrl), 'R10.1: missing https:// is added before asking the relay ('+seenUrl.slice(-45)+')');

  // R10: Following pane — built-in creators always listed with channel links; added ones removable
  w.eval('setTab("saved"); document.querySelector("#savedseg button[data-seg=\'creator\']") && document.querySelector("#savedseg button[data-seg=\'creator\']").click(); renderCreatorDecks();'); await sleep(20);
  const fpills = d.querySelectorAll('#creatorlist .cr-fpill');
  assert(fpills.length>=3, 'R10: Following pane lists the built-in creators ('+fpills.length+')');
  assert([...fpills].every(a=>/^https:\/\/www\.youtube\.com\//.test(a.href)), 'R10: every following pill links to a YouTube channel');
  w.eval('S.addedCreators=[{id:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"@RegisKillbin"}]; S.addedCreatorDecks=[]; renderCreatorDecks();'); await sleep(20);
  const regisPill = [...d.querySelectorAll('#creatorlist .cr-fpill')].find(a=>/RegisKillbin/.test(a.textContent));
  assert(regisPill && /channel\/UCbt1SGMr/.test(regisPill.href) && regisPill.querySelector('.cr-fx'), 'R10: added creator pill links to the channel and has an unfollow button');
  regisPill.querySelector('.cr-fx').click(); await sleep(20);
  assert(w.eval('S.addedCreators.length')===0, 'R10: unfollow from the pane removes the channel');
  // R10.2: creator strips heal fossil compressed ids and render in default Energy order
  w.eval('S.addedCreators=[{id:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"@RegisKillbin"}];'+
    'S.addedCreatorDecks=[{chId:"UCbt1SGMrWj5Q7TMXAfmTERQ",creator:"RegisKillbin",video:"vid",url:"https://youtu.be/x",published:"2026-07-10",name:"t",ids:["Hulk","Armr5","AntMan"],added:true}]; renderCreatorDecks();'); await sleep(20);
  const stripMinis = [...d.querySelectorAll('#creatorlist .cr-strip .mini')].map(m=>m.dataset.d);
  assert(stripMinis.indexOf('Armor')>=0 && stripMinis.indexOf('Armr5')<0, 'R10.2: fossil id Armr5 heals to Armor in the strip ('+stripMinis.join(',')+')');
  assert(stripMinis[0]==='AntMan' && stripMinis[stripMinis.length-1]==='Hulk', 'R10.2: creator strip sorts energy asc (AntMan first, Hulk last)');
  w.eval('S.addedCreators=[]; S.addedCreatorDecks=[]; renderCreatorDecks();'); await sleep(10);
  w.eval('setTab("cards")'); await sleep(10);

  assert(errors.length===0, 'R9: no runtime errors during the meta/coach/branch suite'+(errors.length?' -> '+errors.join(' | '):''));

  console.log('\nDONE. errors:', errors.length?errors:'none');
})();
