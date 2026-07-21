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
  assert(w.eval('SORTS.length')===4, 'SORTS has exactly 4 entries');
  assert(w.eval('SORTS.map(s=>s.k).join()')==='cost,new,power,name', 'SORTS keys are [cost,new,power,name]');
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
  // bench strip: docked 12-slot mirror of the deck zone, Build tab only
  assert(d.body.classList.contains('on-build'), 'Build tab docks the bench strip (body.on-build)');
  assert(d.querySelectorAll('#dt .mini').length===12, 'bench strip always shows 12 slots');
  assert(d.querySelectorAll('#dt .mini:not(.empty)').length===w.eval('activeDeck().cards.length'), 'bench strip mirrors the deck zone fill');
  const cntS = w.eval('activeDeck().cards.length');
  if(cntS){ d.querySelector('#dt .mini:not(.empty)').click(); await sleep(30);
    assert(w.eval('activeDeck().cards.length')===cntS-1, 'tapping a strip card removes it');
    assert(d.querySelectorAll('#dt .mini:not(.empty)').length===cntS-1, 'strip re-renders after the removal'); }
  w.eval('setTab("saved")'); await sleep(20);
  assert(!d.body.classList.contains('on-build'), 'leaving Build undocks the bench strip');
  w.eval('setTab("cards")'); await sleep(20);
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
  assert(w.eval('S.filters.cost.size===0 && S.filters.power.size===0 && S.filters.mech.size===0 && S.filters.series.size===0 && S.filters.owned===""'), 'clear-all empties every filter set incl power');
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
  assert(d.querySelector('#tabbar [data-tab="collection"]')!==null, 'Collection (Library) tab button present');
  w.eval('setTab("collection")'); await sleep(20);
  assert(d.querySelector('#view-collection').classList.contains('on'), 'collection view activates on setTab');
  assert(!d.querySelector('#view-cards').classList.contains('on'), 'build view is hidden while on collection');
  // Library hub: home page with three doors; the sticky back bar navigates
  w.eval('setLibPage("home")'); await sleep(10);
  assert(d.getElementById('lib-home').classList.contains('on') && d.getElementById('lib-back').hidden, 'LIB: hub home shows the doors, back bar hidden');
  assert(d.querySelectorAll('#lib-home [data-libgo]').length===8, 'LIB: all eight doors present (cards/locs/ota/upc/tok/arc/ssn/var)');
  assert(!d.body.classList.contains('on-cards'), 'LIB: tool cluster hidden on the hub (it targets the card grid)');
  d.querySelector('#lib-home [data-libgo="cards"]').click(); await sleep(10);
  assert(d.getElementById('lib-cards').classList.contains('on') && !d.getElementById('lib-home').classList.contains('on'), 'LIB: Cards door opens the cards pane');
  assert(!d.getElementById('lib-back').hidden && /Cards/.test(d.getElementById('lib-title').textContent), 'LIB: back bar visible with the page title');
  assert(d.body.classList.contains('on-cards'), 'R13: floating tool cluster available on the Library Cards page');
  d.getElementById('btn-libback').click(); await sleep(10);
  assert(d.getElementById('lib-home').classList.contains('on') && d.getElementById('lib-back').hidden, 'LIB: back returns to the hub');
  d.querySelector('#lib-home [data-libgo="ota"]').click(); await sleep(10);
  assert(d.getElementById('lib-ota').classList.contains('on') && /Balance changes/.test(d.getElementById('lib-title').textContent), 'LIB: Balance door opens the history pane');
  // Data mines: scheduled + datamined sections, read-only sheet, never enters the deck pool
  w.eval('S.upcoming=[{n:"Future Man",d:"FutureMan1",c:4,p:6,a:"On Reveal: test.",i:"",rel:"2026-08-01"},{n:"Leak Guy",d:"LeakGuy1",c:2,p:3,a:"Ongoing: leak.",i:"",rel:""}]; setLibPage("upc");'); await sleep(20);
  assert(d.getElementById('lib-upc').classList.contains('on') && /Data mines/.test(d.getElementById('lib-title').textContent), 'LIB: Data mines door opens');
  assert(d.querySelectorAll('#upclist .upc-row').length===2 && /Scheduled releases/.test(d.getElementById('upclist').textContent)
    && /Datamined — no date yet/.test(d.getElementById('upclist').textContent), 'LIB: upcoming splits scheduled vs datamined');
  d.querySelector('#upclist .upc-row').click(); await sleep(20);
  assert(/2026-08-01/.test(d.getElementById('modal').textContent) && d.querySelector('#modal #sh-add')===null,
    'LIB: upcoming sheet is read-only (no Add-to-deck) and shows the date');
  w.eval('closeModal()');
  assert(w.eval('S.db.some(c=>c.d==="FutureMan1")')===false, 'LIB: datamined cards never enter the playable pool');
  // Tokens & summons: every curated token renders with its makers
  w.eval('setLibPage("tok")'); await sleep(20);
  assert(d.querySelectorAll('#toklist .tok-row').length===w.eval('Object.keys(S.tokens).length'), 'LIB: tokens page lists every created card');
  assert(/Created by Thanos/.test(d.getElementById('toklist').textContent), 'LIB: tokens name their makers (stones -> Thanos)');
  d.querySelector('#toklist .tok-row').click(); await sleep(20);
  assert(d.getElementById('modalwrap').classList.contains('on') && /Token/.test(d.getElementById('modal').textContent), 'LIB: tapping a token opens its read-only sheet');
  w.eval('closeModal();');
  // makers map from cards.json: abilities render on rows, locations named as makers
  w.eval('applyTokenData(Object.values(S.tokens).concat([{n:"Vibranium",d:"Vibranium",c:1,p:4,a:"Ongoing: indestructible."}]), S.tokenLinks,'+
    '{Vibranium:[{n:"Vibranium Mines",loc:true},{n:"Destroyed Mansion",loc:true}], Mjolnir:[{n:"Thor",loc:false}]}); setLibPage("tok");'); await sleep(20);
  const vRow = [...d.querySelectorAll('#toklist .tok-row')].find(r=>r.dataset.d==='Vibranium');
  assert(vRow!==undefined && /Ongoing: indestructible/.test(vRow.textContent), 'LIB: token abilities render on the row');
  assert(/Created by Vibranium Mines \(location\), Destroyed Mansion \(location\)/.test(vRow.textContent), 'LIB: location makers are named (Vibranium <= Vibranium Mines)');
  const mRow = [...d.querySelectorAll('#toklist .tok-row')].find(r=>r.dataset.d==='Mjolnir');
  assert(mRow!==undefined && /Created by Thor/.test(mRow.textContent) && !/Thor \(location\)/.test(mRow.textContent), 'LIB: card makers carry no location tag');
  w.eval('applyTokenData(TOKEN_SEED.tokens, TOKEN_SEED.links); S.upcoming=[];');
  // Archetype guide: accordion — compact headers + jump chips; grids only when opened
  // (an earlier test swapped in a textless fake db — restore the real one first)
  w.eval('S.db=DB_BASE.slice(); indexDb(); S.owned.add("Wong"); S.arcOpen=null; setLibPage("arc");'); await sleep(30);
  assert(/Destroy/.test(d.getElementById('arclist').textContent) && /Bounce/.test(d.getElementById('arclist').textContent)
    && /Ramp/.test(d.getElementById('arclist').textContent), 'LIB: archetype guide renders rule-based and guide-only sections');
  const _arcN = d.querySelectorAll('#arclist .arc-acc').length;
  assert(_arcN>=13, 'LIB: every archetype gets a compact header row ('+_arcN+' sections)');
  assert(d.querySelectorAll('#arclist .arc-chip').length===_arcN, 'LIB: jump chips mirror the section list 1:1');
  assert(d.querySelectorAll('#arclist .mini').length===0, 'LIB: guide starts fully collapsed — no card grids in the DOM');
  const _arcSec = lbl => [...d.querySelectorAll('#arclist .arc-acc')].find(a=>a.querySelector('.arc-ht b').textContent===lbl);
  _arcSec('Destroy').querySelector('.arc-head').click(); await sleep(20);
  assert(_arcSec('Destroy').classList.contains('open') && _arcSec('Destroy').querySelectorAll('.mini').length>5,
    'LIB: tapping a header expands its card grid');
  assert(d.querySelectorAll('#arclist .mini.unowned').length>0, 'LIB: unowned cards are dimmed in the guide');
  _arcSec('Bounce').querySelector('.arc-head').click(); await sleep(20);
  assert(_arcSec('Bounce').classList.contains('open') && !_arcSec('Destroy').classList.contains('open')
    && d.querySelectorAll('#arclist .arc-acc.open').length===1, 'LIB: only one section stays open at a time');
  d.querySelector('#arclist .arc-chip:last-child').click(); await sleep(20);
  assert(d.querySelector('#arclist .arc-acc:last-child').classList.contains('open')
    && d.querySelectorAll('#arclist .arc-acc.open').length===1, 'LIB: a jump chip opens exactly its section');
  d.querySelector('#arclist .arc-acc.open .arc-head').click(); await sleep(20);
  assert(d.querySelectorAll('#arclist .arc-acc.open').length===0, 'LIB: tapping an open header collapses it again');
  w.eval('S.owned.delete("Wong"); S.arcOpen=null;');
  // Season countdown: next drop + season detection from branded suffixes
  w.eval('S.upcoming=[{n:"Test Guy",d:"TG1",c:1,p:1,a:"",i:"",rel:"2099-01-05"},'+
    '{n:"A Frost Giants",d:"FG1",c:2,p:2,a:"",i:"",rel:"2099-02-02"},{n:"B Frost Giants",d:"FG2",c:3,p:3,a:"",i:"",rel:"2099-02-09"},'+
    '{n:"C Frost Giants",d:"FG3",c:4,p:4,a:"",i:"",rel:"2099-02-16"}]; setLibPage("ssn");'); await sleep(20);
  assert(/Next card drop/.test(d.getElementById('ssnlist').textContent) && /Test Guy/.test(d.getElementById('ssnlist').textContent), 'LIB: season page names the next drop');
  assert(/Next season/.test(d.getElementById('ssnlist').textContent) && /Frost Giants/.test(d.getElementById('ssnlist').textContent), 'LIB: branded suffix detection finds the next season');
  assert(d.querySelectorAll('#ssnlist .upc-row').length===4, 'LIB: the release timeline lists every scheduled card');
  w.eval('S.upcoming=[];');
  // Variant gallery: lazy load, search, per-card sheet with artist credits
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({Wong:[{a:"https://x/1.webp",by:"Artgerm"},{a:"https://x/2.webp"}],Hulk:[{a:"https://x/3.webp",by:"Dan Hipp"},{a:"https://x/4.webp",u:1}]})}); S.variants=null; setLibPage("var"); await new Promise(r=>setTimeout(r,50)); window.fetch=of; })()');
  assert(w.eval('S.variants && Object.keys(S.variants).length')===2, 'LIB: variants.json lazy-loads on first open');
  assert(d.querySelectorAll('#varlist .var-cell').length===2 && /2/.test(d.querySelector('#varlist .var-cell .var-n').textContent),
    'LIB: gallery shows one cell per card with its variant count');
  const _vq = d.getElementById('var-q'); _vq.value='hulk'; _vq.dispatchEvent(new w.window.Event('input',{bubbles:true})); await sleep(20);
  assert(d.querySelectorAll('#varlist .var-cell').length===1, 'LIB: gallery search narrows to matching cards');
  d.querySelector('#varlist .var-cell').click(); await sleep(20);
  assert(d.querySelectorAll('#modal .var-fig').length===2 && /Dan Hipp/.test(d.getElementById('modal').textContent),
    'LIB: tapping a card opens its gallery with artist credits');
  assert(d.querySelectorAll('#modal .var-fig .dm').length===1 && /datamined/.test(d.querySelector('#modal').textContent),
    'LIB: not-yet-released variant art wears a datamined tag');
  w.eval('closeModal(); S.variants=null; S.varQ=""; document.getElementById("var-q").value="";');
  // Variant gallery v2: ALL cards queue up, rendered in batches from a sentinel
  await w.eval('(async()=>{ const of=window.fetch; const big={}; S.db.slice(0,150).forEach((c,i)=>{ big[c.d]=Array.from({length:(i%4)+1},(_,k)=>({a:"https://x/"+c.d+"/"+k+".webp"})); }); window.fetch=async()=>({ok:true,json:async()=>big}); S.variants=null; setLibPage("var"); await new Promise(r=>setTimeout(r,60)); window.fetch=of; })()');
  assert(w.eval('S.varList.length')===150, 'VAR: every card with art is queued — no top-60 cap');
  assert(d.querySelectorAll('#varlist .var-cell').length===60, 'VAR: only the first batch of 60 is in the DOM at load');
  assert(/All 150 cards/.test(d.getElementById('varlist').textContent), 'VAR: the note says the whole gallery is here');
  const _vmore = d.querySelector('#varlist #var-morebtn');
  assert(_vmore!==null, 'VAR: without IntersectionObserver a Show-more button stands in for the sentinel');
  _vmore.click(); await sleep(10);
  assert(d.querySelectorAll('#varlist .var-cell').length===120, 'VAR: pulling the sentinel appends the next batch');
  w.eval('varAppend()'); await sleep(10);
  assert(d.querySelectorAll('#varlist .var-cell').length===150, 'VAR: the last batch completes the gallery');
  assert(d.querySelector('#varlist .var-more').hidden===true, 'VAR: the sentinel retires once everything is shown');
  const _vnm = w.eval('S.varList[0].n');
  const _vq2 = d.getElementById('var-q'); _vq2.value=_vnm.toLowerCase(); _vq2.dispatchEvent(new w.window.Event('input',{bubbles:true})); await sleep(20);
  assert(d.querySelectorAll('#varlist .var-cell').length>=1 && d.querySelectorAll('#varlist .var-cell').length<150
    && w.eval('S.varN')===d.querySelectorAll('#varlist .var-cell').length, 'VAR: search re-renders from batch one');
  w.eval('S.variants=null; S.varQ=""; document.getElementById("var-q").value="";');
  // My archetypes: create via the editor, renders first in the guide, feeds the fit engine
  w.eval('S.myArches=[]; setLibPage("arc");'); await sleep(20);
  d.getElementById('btn-addarch').click(); await sleep(20);
  assert(d.getElementById('arch-name')!==null, 'ARCH: New archetype opens the editor with a name field');
  const _arcType = async (txt) => { const q=d.getElementById('syn-q'); q.value=txt; q.dispatchEvent(new w.window.Event('input',{bubbles:true})); await sleep(20); };
  d.getElementById('arch-name').value='Wong Ball';
  await _arcType('wong'); d.querySelector('#syn-matches .mini[data-d="Wong"]').click(); await sleep(20);
  await _arcType('odin'); d.querySelector('#syn-matches .mini[data-d="Odin"]').click(); await sleep(20);
  await _arcType('black panther'); d.querySelector('#syn-matches .mini[data-d="BlackPanther"]').click(); await sleep(20);
  d.getElementById('syn-note').value='Double On Reveals, Panther gets huge.';
  d.getElementById('arch-save').click(); await sleep(30);
  assert(w.eval('S.myArches.length')===1 && w.eval('S.myArches[0].name')==='Wong Ball' && w.eval('S.myArches[0].ids.length')===3, 'ARCH: Save records name + cards + note');
  assert(/Wong Ball/.test(d.getElementById('arclist').textContent) && /Double On Reveals/.test(d.getElementById('arclist').textContent),
    'ARCH: the custom archetype renders at the top of the guide');
  assert(d.querySelector('#arclist [data-arcedit]')!==null && d.querySelector('#arclist [data-arcdel]')!==null, 'ARCH: custom sections carry Edit + Delete');
  assert(d.querySelector('#arclist .arc-acc').dataset.arckey.indexOf('my-')===0
    && d.querySelector('#arclist .arc-acc .arc-ht b').textContent==='Wong Ball', 'ARCH: the custom archetype is the first accordion section');
  assert(d.querySelector('#arclist .arc-acc.open .mini[data-d="Wong"]')!==null, 'ARCH: a freshly saved archetype opens with its cards showing');
  // fit engine: 2 members in deck -> the third is suggested as "your Wong Ball"
  w.eval('(function(){ var dd={id:"arcfit",name:"",cards:["Wong","Odin","Hulk"],updated:Date.now()}; S.decks.unshift(dd); S.activeId="arcfit"; })(); renderAll();'); await sleep(20);
  const _arcSugg = w.eval('fitSuggestions(20).map(s=>({d:s.c.d,why:s.why}))').find(s=>s.d==='BlackPanther');
  assert(_arcSugg!==undefined && /your Wong Ball/.test(_arcSugg.why), 'ARCH: fitSuggestions offers the missing member as "your Wong Ball"');
  assert(w.eval('buildStateBlob().myArches.length')===1, 'ARCH: archetypes ride the sync blob');
  // flex slots: sheet toggle, badges, swap-order priority, coach text
  w.eval('setTab("deck"); openCardSheet("Hulk");'); await sleep(20);
  assert(d.querySelector('#modal #sh-flex')!==null, 'FLEX: in-deck card sheet offers the flex toggle');
  d.querySelector('#modal #sh-flex').click(); await sleep(30);
  assert(w.eval('(activeDeck().flex||[]).indexOf("Hulk")')>=0, 'FLEX: toggling marks the card as flex on the deck');
  assert(/Flex slot ✓/.test(d.querySelector('#modal #sh-flex').textContent), 'FLEX: the sheet reflects the flex state');
  w.eval('closeModal(); renderAll();'); await sleep(20);
  assert(d.querySelector('#decklist .mini[data-d="Hulk"]').classList.contains('flexed'), 'FLEX: the hero grid badges the flex card');
  assert(d.querySelector('#dz .mini[data-d="Hulk"]').classList.contains('flexed') && d.querySelector('#dt .mini[data-d="Hulk"]').classList.contains('flexed'),
    'FLEX: build zone + bench strip badge it too');
  assert(/\[FLEX SLOT/.test(w.eval('deckAsText()')), 'FLEX: the coach is told which cards are flex');
  w.eval('(function(){ var dd=activeDeck(); dd.cards=dd.cards.concat(S.db.filter(function(c){return dd.cards.indexOf(c.d)<0;}).slice(0,9).map(function(c){return c.d;})); touch(dd); })(); renderAll();'); await sleep(20);
  w.eval('openSwapSheet(S.db.filter(function(c){return activeDeck().cards.indexOf(c.d)<0;})[0].d);'); await sleep(20);
  assert(d.querySelector('#modal .swapgrid .mini').dataset.d==='Hulk' && /flex slots first/.test(d.getElementById('modal').textContent),
    'FLEX: the swap sheet leads with flex slots');
  w.eval('closeModal(); (activeDeck().flex||[]).length=0; toggleCard("Hulk");'); await sleep(20);
  assert(w.eval('(activeDeck().flex||[]).indexOf("Hulk")')<0, 'FLEX: removing a card clears its flex mark');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="arcfit";}); S.activeId=null; S.myArches=[]; renderAll();'); await sleep(10);
  w.eval('setTab("collection"); setLibPage("cards")'); await sleep(10);
  w.eval('setTab("deck")'); await sleep(10);
  assert(!d.body.classList.contains('on-cards'), 'floating tool cluster is gated OFF elsewhere (Deck tab)');
  w.eval('setTab("collection")'); await sleep(10);

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
  // Copy code straight from the creator row — no save-then-export detour
  const _ccBtn = [..._crows[0].querySelectorAll('button.abtn')].find(b=>b.textContent==='Copy code');
  assert(_ccBtn!==undefined, 'creator row with ids offers Copy code');
  assert(![..._crows[1].querySelectorAll('button.abtn')].some(b=>b.textContent==='Copy code'), 'link-only creator deck has no Copy code');
  w.eval('window.__copied=null; navigator.clipboard.writeText=async t=>{ window.__copied=t; return true; };');
  _ccBtn.click(); await sleep(30);
  const _ccode = w.eval('window.__copied');
  assert(typeof _ccode==='string' && _ccode.length>10, 'Copy code writes the code to the clipboard');
  const _cdec = JSON.parse(Buffer.from(_ccode,'base64').toString('utf8'));
  assert(_cdec.Name==='Test Deck' && Array.isArray(_cdec.Cards) && _cdec.Cards.length===w.eval('S.creatorDecks[0].ids.length')
    && _cdec.Cards.every(c=>c.CardDefId), 'the copied code is a valid Snap share code for that deck');
  assert(/Copied/.test(_ccBtn.textContent), 'the button confirms the copy');

  // --- marvelsnapzone (zone) + snap.fan (fan) link-outs render for undecodable entries ---
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>('+
    JSON.stringify({updated:'2026-07-09',decks:[
      {creator:'X',video:'Zone Video',url:'https://youtu.be/z1',published:'2026-07-08',name:'Toxic Thanos',ids:[],zone:'https://marvelsnapzone.com/decks/toxicsoulking32c870a/'},
      {creator:'Y',video:'Fan Video',url:'https://youtu.be/f1',published:'2026-07-07',name:'',ids:[],fan:'https://snap.fan/decks/355403/'}
    ]})+
    ')}); await loadCreatorDecks(); window.fetch=of; })()');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#savedseg [data-seg="mine"]').click(); await sleep(10);
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(30);
  const _zrows = d.querySelectorAll('#creatorlist .crow');
  assert(_zrows[0].querySelector('a[href*="marvelsnapzone.com"]')!==null, 'zone-only creator deck shows a Snap Zone link-out');
  assert(_zrows[0].querySelector('.cr-deckname')!==null && _zrows[0].querySelector('.cr-deckname').textContent==='Toxic Thanos',
    'the deck name renders on the row (tells apart multiple decks per video)');
  const _zprev = _zrows[0].querySelector('img.cr-zoneprev');
  assert(_zprev!==null && _zprev.src.indexOf('deckpreview.php?slug=toxicsoulking32c870a')>=0,
    'undecoded zone deck shows the official 12-card preview image');
  assert(_zrows[1].querySelector('a[href*="snap.fan"]')!==null, 'fan-only creator deck shows a snap.fan link-out');
  assert(_zrows[1].querySelector('img.cr-zoneprev')===null, 'fan-only rows get no zone preview image');

  // --- built-in + followed channel: the same deck arrives twice, ids-bearing entry wins ---
  w.eval('S.addedCreatorDecks=[{creator:"X",video:"Zone Video",url:"https://youtu.be/z1",published:"2026-07-08",name:"",ids:[],zone:"https://marvelsnapzone.com/decks/dupdeck1/",added:true,chId:"UCdup"}];'+
    'S.creatorDecks=[{creator:"X",video:"Zone Video",url:"https://youtu.be/z1",published:"2026-07-08",name:"Dup Deck",ids:'+JSON.stringify(SLUGIDS)+',zone:"https://marvelsnapzone.com/decks/dupdeck1/",untapped:"",fan:""}];');
  w.eval('setTab("saved")'); await sleep(10);
  d.querySelector('#savedseg [data-seg="mine"]').click(); await sleep(10);
  d.querySelector('#savedseg [data-seg="creator"]').click(); await sleep(30);
  const _drows = d.querySelectorAll('#creatorlist .crow');
  assert(_drows.length===1, 'built-in + added duplicate collapses to one row (got '+_drows.length+')');
  assert(_drows[0].querySelectorAll('.cr-strip .mini').length===12, 'the surviving row is the decoded one (12-card strip)');
  w.eval('S.addedCreatorDecks=[];');

  // --- creator management: pop-up manager; every row removable; built-ins mute + restore ---
  w.eval('S.prefs.hiddenCreators=[]; S.crFilter=null; S.crCardQ=""; S.addedCreators=[]; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelector('#btn-managecr')!==null && /Following · \d+ creators/.test(d.querySelector('#btn-managecr').textContent),
    'the pane shows ONE compact manage button, not a pill wall');
  d.querySelector('#btn-managecr').click(); await sleep(20);
  const mgPills = [...d.querySelectorAll('#modal .cr-fpill')];
  assert(mgPills.length>=4 && mgPills.every(a=>a.querySelector('.cr-fx')!==null), 'the manager pop-up lists every creator with a remove button');
  const sjPill = mgPills.find(a=>/Snap Judgments/.test(a.textContent));
  assert(sjPill!==undefined, 'Snap Judgments is a built-in row in the manager');
  sjPill.querySelector('.cr-fx').click(); await sleep(30);
  assert(w.eval('S.prefs.hiddenCreators').includes('Snap Judgments'), 'hiding a built-in lands in prefs (synced)');
  assert(![...d.querySelectorAll('#modal .cr-fpill')].some(a=>/Snap Judgments/.test(a.textContent)), 'hidden built-in leaves the manager list');
  assert([...d.querySelectorAll('#creatorlist .crow .cr-creator')].every(e=>e.textContent!=='Snap Judgments'), 'hidden creator rows leave the deck list');
  const hpill = [...d.querySelectorAll('#modal .cr-hpill')].find(b=>/Snap Judgments/.test(b.textContent));
  assert(hpill!==undefined, 'a restore chip appears in the manager');
  hpill.click(); await sleep(30);
  assert(w.eval('S.prefs.hiddenCreators.length')===0 && [...d.querySelectorAll('#modal .cr-fpill')].some(a=>/Snap Judgments/.test(a.textContent)),
    'restore chip brings the built-in back');
  // built-in + followed channel: ONE merged row whose × unfollows AND mutes
  w.eval('closeModal(); S.addedCreators=[{id:"UCRM70o4UWSPL839M9d42xGw",name:"Snap Judgments",handle:"@snapjudgments"}]; renderCreatorDecks();'); await sleep(20);
  d.querySelector('#btn-managecr').click(); await sleep(20);
  const sjPills = [...d.querySelectorAll('#modal .cr-fpill')].filter(a=>/Snap Judgments/.test(a.textContent));
  assert(sjPills.length===1, 'built-in + followed channel merges to one manager row (got '+sjPills.length+')');
  sjPills[0].querySelector('.cr-fx').click(); await sleep(30);
  assert(w.eval('S.addedCreators.length')===0 && w.eval('S.prefs.hiddenCreators').includes('Snap Judgments'), 'merged row × unfollows and mutes in one tap');
  w.eval('closeModal(); S.prefs.hiddenCreators=[]; sSet(K.prefs, S.prefs); renderCreatorDecks();'); await sleep(20);

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

  // --- skip a turn: deliberate pass, undo, and card-assign clears it ---
  d.querySelector('#planner .pl-slot[data-t="3"]').click(); await sleep(20);
  d.querySelector('#pl-pick-skip').click(); await sleep(20);
  assert(!d.querySelector('#pl-picker').classList.contains('on'), 'skip: picking Skip dismisses the sheet');
  assert(d.querySelector('#planner .pl-slot[data-t="3"]').classList.contains('skipped'), 'skip: the turn row shows the skipped state');
  assert(w.eval('!!(activeLine(activeDeck()).skip||[])[2]'), 'skip: the flag rides the line object (survives normalization)');
  d.querySelector('#planner .pl-slot[data-t="3"] [data-unskip]').click(); await sleep(20);
  assert(!d.querySelector('#planner .pl-slot[data-t="3"]').classList.contains('skipped'), 'skip: tapping the tag un-skips the turn');
  d.querySelector('#planner .pl-slot[data-t="3"]').click(); await sleep(20);
  d.querySelector('#pl-pick-skip').click(); await sleep(20);
  d.querySelector('#planner .pl-slot[data-t="3"]').click(); await sleep(20);   // reopen the picker on a skipped turn
  d.querySelector('#pl-picker .pl-pick .mini[data-d="'+_c3id+'"]').click(); await sleep(20);
  assert(w.eval('!(activeLine(activeDeck()).skip||[])[2]'), 'skip: assigning a card to a skipped turn clears the flag');
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
  assert(/Recent creator decklists/.test(_dig) && /"Beta Deck" by Beta \(2026-07-02\)/.test(_dig) && /Wong/.test(_dig),
    'H: the digest carries full recent decklists, newest first');
  w.eval('S.creatorDecks=[]');
  assert(w.eval('deckMetaNote(activeDeck())')===null && w.eval('creatorMetaDigest()')==='', 'H: empty creator meta -> null note + empty digest');
  w.eval('S.creatorDecks=[{creator:"Beta",video:"v2",url:"",published:"2026-07-02",name:"Beta Deck",ids:["Hulk","AntMan","Wong"],untapped:""}]; setTab("deck"); renderDeck();'); await sleep(20);
  assert(/creator decks/.test(d.querySelector('#deckmeta').textContent), 'H: #deckmeta renders the overlap note when creator decks exist');
  // coach prompt splices the digest in (capture the request body via a fetch swap)
  await w.eval('(async()=>{ const of=window.fetch; let cap=null; window.fetch=async(u,o)=>{ cap=o; return { ok:true, json:async()=>({content:[{type:"text",text:"ok"}]}) }; }; setTab("ai"); document.getElementById("btn-ask").click(); await new Promise(r=>setTimeout(r,60)); window.__coachCap=cap; window.fetch=of; })()');
  const _capBody = w.eval('window.__coachCap && window.__coachCap.body');
  assert(_capBody && /creator meta/i.test(_capBody), 'H: coach prompt includes the creator-meta digest block');
  // the coach's grounding: rules primer + the FULL card pool ride as `system`
  const _capParsed = JSON.parse(_capBody);
  assert(typeof _capParsed.system === 'string' && /HOW MARVEL SNAP WORKS/.test(_capParsed.system), 'coach: rules primer rides in system');
  assert(/COMPLETE CURRENT CARD POOL/.test(_capParsed.system) && _capParsed.system.includes('Hulk ['), 'coach: the whole card database is in system');
  assert(w.eval('S.db.length') < 20 || _capParsed.system.split('\n').length > w.eval('S.db.length'), 'coach: system lists one line per card');
  assert(typeof _capParsed.prompt === 'string' && /Current deck/.test(_capParsed.prompt), 'coach: the deck + question ride in prompt');
  // declared synergies flow into the coach's context
  await w.eval('(async()=>{ S.mySyns=[{id:"t1",ids:["Wong","Odin"],note:"double reveals"}]; const of=window.fetch; let cap=null; window.fetch=async(u,o)=>{ cap=o; return { ok:true, json:async()=>({content:[{type:"text",text:"ok"}]}) }; }; document.getElementById("btn-ask").click(); await new Promise(r=>setTimeout(r,60)); window.__coachCap2=cap; window.fetch=of; S.mySyns=[]; })()');
  const _cap2 = JSON.parse(w.eval('window.__coachCap2.body'));
  assert(/personally declared/.test(_cap2.prompt) && /Wong \+ Odin — double reveals/.test(_cap2.prompt), 'coach: user-declared combos ride in prompt');
  // grounding v2: the coach knows every location and every created card, not just the deck
  await w.eval('(async()=>{ const savedL=S.locations, savedT=S.tokens; S.locations=[{n:"Test Tavern",d:"TT",a:"Cards here cost 1 less."}]; S.tokens={Widget:{n:"Widget",d:"Widget",c:1,p:2,a:"Test token."}}; const of=window.fetch; let cap=null; window.fetch=async(u,o)=>{ cap=o; return { ok:true, json:async()=>({content:[{type:"text",text:"ok"}]}) }; }; document.getElementById("btn-ask").click(); await new Promise(r=>setTimeout(r,60)); window.__coachCap3=cap; window.fetch=of; S.locations=savedL; S.tokens=savedT; })()');
  const _cap3 = JSON.parse(w.eval('window.__coachCap3.body'));
  assert(/ALL LOCATIONS/.test(_cap3.system) && /Test Tavern: Cards here cost 1 less\./.test(_cap3.system), 'coach: the full location list rides in system');
  assert(/CREATED CARDS/.test(_cap3.system) && /Widget \[1\/2\] Test token\./.test(_cap3.system), 'coach: created tokens ride in system');
  assert(/cubes/i.test(_cap3.system) && /priority/i.test(_cap3.system) && /no mulligan/.test(_cap3.system), 'coach: the primer teaches cubes, priority, and draw math');
  assert(_cap3.system.length < 240000, 'coach: system grounding stays under the worker cap');

  // ============ OTA balance history (card-changes.json) ============
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({updated:"2026-07-16",changes:['+
    '{at:"2026-07-16",d:"Hulk",n:"Hulk",ch:[{k:"p",from:12,to:11}]},'+
    '{at:"2026-07-16",d:"Wong",n:"Wong",ch:[{k:"a",from:"old text",to:"new text"}]},'+
    '{at:"2026-07-10",d:"Hulk",n:"Hulk",ch:[{k:"c",from:6,to:5}]}'+
    ']})}); window.__cch=await loadCardChanges(); window.fetch=of; })()');
  assert(w.eval('window.__cch')===true && w.eval('S.cardChanges.length')===3, 'OTA: loadCardChanges ingests the ledger');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u)=>({ok:true,json:async()=>({whatever:1})}); window.__cchB=await loadCardChanges(); window.fetch=of; })()');
  assert(w.eval('window.__cchB')===false && w.eval('S.cardChanges.length')===3, 'OTA: malformed ledger is ignored, state kept');
  w.eval('S.otaOpen=null; renderOtaHistory()'); await sleep(20);
  assert(d.querySelectorAll('#otalist .ota-row').length===3, 'OTA: Library renders one row per change');
  assert(d.querySelectorAll('#otalist .arc-acc').length===2, 'OTA: changes group into one collapsible block per patch date');
  assert(d.querySelector('#otalist .arc-acc').classList.contains('open') && d.querySelector('#otalist .arc-acc:last-child .arc-body').hidden===true,
    'OTA: the newest date starts open, older dates start collapsed');
  assert(/Power 12 → 11/.test(d.querySelector('#otalist .ota-row .ota-txt span').textContent), 'OTA: stat changes read as words');
  assert(d.querySelector('#otalist .ota-diff .dfw').textContent==='old' && d.querySelector('#otalist .ota-diff .dfa').textContent==='new',
    'OTA: text changes diff word-by-word — removed red, added green');
  d.querySelector('#otalist .arc-acc:last-child .arc-head').click(); await sleep(20);
  assert(d.querySelector('#otalist .arc-acc:last-child .arc-body').hidden===false, 'OTA: tapping a collapsed date expands it');
  d.querySelector('#otalist .arc-acc:last-child .arc-head').click(); await sleep(20);
  assert(d.querySelector('#otalist .arc-acc:last-child .arc-body').hidden===true, 'OTA: tapping again collapses the date');
  d.querySelector('#otalist .ota-row').click(); await sleep(20);
  assert(d.getElementById('modalwrap').classList.contains('on') && /Balance history/.test(d.getElementById('modal').textContent)
    && /Power 12 → 11/.test(d.getElementById('modal').textContent) && /Cost 6 → 5/.test(d.getElementById('modal').textContent),
    'OTA: tapping a row opens the card sheet with that card’s full history');
  w.eval('closeModal()');
  assert(/RECENT BALANCE CHANGES/.test(w.eval('coachSystemText()')) && /Hulk — Power 12 → 11/.test(w.eval('coachSystemText()')),
    'OTA: the coach hears about recent changes');
  w.eval('S.cardChanges=[]; renderOtaHistory();'); await sleep(10);
  assert(/No balance changes recorded yet/.test(d.getElementById('otalist').textContent) && !/RECENT BALANCE CHANGES/.test(w.eval('coachSystemText()')),
    'OTA: empty ledger shows the starts-now hint + no coach block');

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
  // marvelsnapzone + snap.fan links: deck-builder decodes in-app, walled pages become link-outs
  const _zdesc = 'Deck A: https://marvelsnapzone.com/deck-builder/?deck='+encodeURIComponent(_dcode)+
    '\nDeck B: https://marvelsnapzone.com/decks/somebody123abc/\nDeck C: https://snap.fan/decks/355403/';
  const _zx = w.eval('extractDecksFromDesc('+JSON.stringify(_zdesc)+')');
  assert(_zx.length===3, 'zone/fan: three links -> three entries (got '+_zx.length+')');
  assert(_zx[0].ids.length===12 && _zx[0].name==='Deck A' && /deck-builder/.test(_zx[0].zone), 'zone deck-builder link decodes 12 ids in-app + keeps the label');
  assert(_zx[1].ids.length===0 && _zx[1].zone==='https://marvelsnapzone.com/decks/somebody123abc/', 'zone community page -> link-out entry');
  assert(_zx[2].ids.length===0 && _zx[2].fan==='https://snap.fan/decks/355403/', 'snap.fan page -> link-out entry');
  // unlabelled zone pages take their name from the slug; docs-redirect junk never enters the url
  const _zx2 = w.eval('extractDecksFromDesc('+JSON.stringify('x https://marvelsnapzone.com/decks/monkey-boomerang/ y https://marvelsnapzone.com/decks/smitty/&sa=D&source=docs&ust=1')+')');
  assert(_zx2.length===2 && _zx2[0].name==='Monkey Boomerang', 'zone slug becomes the display name (got '+_zx2[0].name+')');
  assert(_zx2[1].zone==='https://marvelsnapzone.com/decks/smitty/' && _zx2[1].name==='Smitty', '& cuts docs-redirect residue off the zone url');

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
  const OLD_RSS = MOCK_RSS.replace(_pubRecent, new Date(Date.now()-90*86400000).toISOString());   // R11.3: window widened to 30 days
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(OLD_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===0, 'J: videos older than the 30-day window add no decks');
  // R8: with the modal open, failures land in #cr-msg (visible, named channel) instead of a vanishing toast
  w.eval('openAddCreator()'); await sleep(10);
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(OLD_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  const crMsg = d.querySelector('#cr-msg');
  assert(crMsg && crMsg.style.display!=='none' && /Found .+no Snap deck codes/.test(crMsg.textContent), 'R8: no-codes failure names the channel in the modal ('+(crMsg?crMsg.textContent.slice(0,40):'')+')');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:false,status:502,json:async()=>({error:"feed returned 502"}),text:async()=>""}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(/Couldn’t reach|Couldn’t reach/.test(d.querySelector('#cr-msg').textContent), 'R8: unreachable-channel failure shows the retry-later message');
  w.eval('closeModal()');
  w.eval('setTab("cards")'); await sleep(10);

  // --- R16: added creators refresh daily (the "refresh daily" promise was only true for built-ins) ---
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(MOCK_RSS)+'),json:async()=>({})}); await addCreator("https://youtube.com/@mocktuber"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===1, 'R16 setup: MockTuber re-added with one deck');
  const _pubNewest = new Date(Date.now()-1*86400000).toISOString();
  const FRESH_ENTRY = '<entry><title>Brand New Banger</title>'+
    '<link rel="alternate" href="https://www.youtube.com/watch?v=mock456"/>'+
    '<published>'+_pubNewest+'</published>'+
    '<media:group><media:description>Code:\n'+_dcode+'\nGG</media:description></media:group>'+
    '</entry>';
  const MOCK_RSS2 = MOCK_RSS.replace('<entry>', FRESH_ENTRY + '<entry>');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(MOCK_RSS2)+'),json:async()=>({})}); await refreshAddedCreators(true); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===2, 'R16: the daily refresh harvests the channel\'s NEW video');
  assert(w.eval('S.addedCreatorDecks.some(d=>d.video==="Brand New Banger")'), 'R16: the new deck carries its video title');
  await sleep(400);
  assert(typeof JSON.parse(w.eval('localStorage.getItem("snapwb-crfresh")')||'0')==='number' && JSON.parse(w.eval('localStorage.getItem("snapwb-crfresh")'))>0, 'R16: the refresh stamps its freshness');
  const _crPersist2 = w.eval('JSON.parse(localStorage.getItem("snapwb-creators")||"null")');
  assert(_crPersist2 && _crPersist2.decks && _crPersist2.decks.length===2, 'R16: refreshed decks persist to K.creators');
  const _ttlHits = await w.eval('(async()=>{ let n=0; const of=window.fetch; window.fetch=async(u,o)=>{n++; return {ok:true,status:200,text:async()=>"",json:async()=>({})};}; await refreshAddedCreators(); window.fetch=of; return n; })()');
  assert(_ttlHits===0, 'R16: a fresh stamp means no network — at most one re-harvest a day');
  w.eval('localStorage.setItem("snapwb-crfresh", JSON.stringify(Date.now()-30*3600*1000))');
  const _failHits = await w.eval('(async()=>{ let n=0; const of=window.fetch; window.fetch=async(u,o)=>{n++; return {ok:false,status:502,json:async()=>({}),text:async()=>""};}; await refreshAddedCreators(); window.fetch=of; return n; })()');
  assert(_failHits>0 && w.eval('S.addedCreatorDecks.length')===2, 'R16: a stale stamp retries, and a dead relay never clobbers cached decks');
  w.eval('localStorage.setItem("snapwb-crfresh", JSON.stringify(Date.now()-30*3600*1000))');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async(u,o)=>({ok:true,status:200,text:async()=>('+JSON.stringify(OLD_RSS)+'),json:async()=>({})}); await refreshAddedCreators(); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===2, 'R16: a codeless (out-of-window) feed keeps yesterday\'s decks');
  w.eval('S.addedCreators=[]; S.addedCreatorDecks=[]; persistCreators(); localStorage.removeItem("snapwb-crfresh");'); await sleep(10);

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

  // R10 → pop-up: the manager lists built-ins with channel links; added ones removable
  w.eval('setTab("saved"); document.querySelector("#savedseg button[data-seg=\'creator\']") && document.querySelector("#savedseg button[data-seg=\'creator\']").click(); renderCreatorDecks();'); await sleep(20);
  d.querySelector('#btn-managecr').click(); await sleep(20);
  const fpills = d.querySelectorAll('#modal .cr-fpill');
  assert(fpills.length>=3, 'R10: the manager lists the built-in creators ('+fpills.length+')');
  assert([...fpills].every(a=>/^https:\/\/www\.youtube\.com\//.test(a.href)), 'R10: every manager row links to a YouTube channel');
  w.eval('closeModal(); S.addedCreators=[{id:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"@RegisKillbin"}]; S.addedCreatorDecks=[]; renderCreatorDecks();'); await sleep(20);
  d.querySelector('#btn-managecr').click(); await sleep(20);
  const regisPill = [...d.querySelectorAll('#modal .cr-fpill')].find(a=>/RegisKillbin/.test(a.textContent));
  assert(regisPill && /channel\/UCbt1SGMr/.test(regisPill.href) && regisPill.querySelector('.cr-fx'), 'R10: added creator row links to the channel and has an unfollow button');
  regisPill.querySelector('.cr-fx').click(); await sleep(20);
  assert(w.eval('S.addedCreators.length')===0, 'R10: unfollow from the manager removes the channel');
  w.eval('closeModal();'); await sleep(10);
  // R10.2: creator strips heal fossil compressed ids and render in default Energy order
  w.eval('S.addedCreators=[{id:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"@RegisKillbin"}];'+
    'S.addedCreatorDecks=[{chId:"UCbt1SGMrWj5Q7TMXAfmTERQ",creator:"RegisKillbin",video:"vid",url:"https://youtu.be/x",published:"2026-07-10",name:"t",ids:["Hulk","Armr5","AntMan"],added:true}]; renderCreatorDecks();'); await sleep(20);
  const stripMinis = [...d.querySelectorAll('#creatorlist .cr-strip .mini')].map(m=>m.dataset.d);
  assert(stripMinis.indexOf('Armor')>=0 && stripMinis.indexOf('Armr5')<0, 'R10.2: fossil id Armr5 heals to Armor in the strip ('+stripMinis.join(',')+')');
  assert(stripMinis[0]==='AntMan' && stripMinis[stripMinis.length-1]==='Hulk', 'R10.2: creator strip sorts energy asc (AntMan first, Hulk last)');
  w.eval('S.addedCreators=[]; S.addedCreatorDecks=[]; renderCreatorDecks();'); await sleep(10);
  w.eval('setTab("cards")'); await sleep(10);

  assert(errors.length===0, 'R9: no runtime errors during the meta/coach/branch suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R11: the vanishing-creator fix — flush pending saves on hide/pagehide ============
  // (empirically verified: a creator added then backgrounded within the 400ms sSet debounce
  //  was never written; and fetch keepalive bodies >64KiB throw in Chromium/WebKit)
  // 1) the debounce is intact (no write yet) AND flushSaves lands it without waiting
  w.eval('localStorage.removeItem("snapwb-creators"); S.addedCreators=[{id:"UCflush1",name:"Flush Test"}]; S.addedCreatorDecks=[]; persistCreators();');
  assert(!/UCflush1/.test(w.localStorage.getItem('snapwb-creators')||''), 'R11: sSet still debounces (no write inside the 400ms window)');
  w.eval('flushSaves()');
  assert(/UCflush1/.test(w.localStorage.getItem('snapwb-creators')||''), 'R11: flushSaves persists the pending creator immediately');
  // 2) the flushed timer must not double-fire later (pending entry consumed)
  w.eval('localStorage.setItem("snapwb-creators", JSON.stringify({channels:[{id:"UCcanary"}],decks:[]}))');
  await sleep(500);
  assert(/UCcanary/.test(w.localStorage.getItem('snapwb-creators')||''), 'R11: a flushed save does not re-fire when its old timer lapses');
  // 3) pagehide flushes pending saves (the quick-exit path)
  w.eval('S.addedCreators=[{id:"UCpagehide",name:"PH"}]; persistCreators(); window.dispatchEvent(new Event("pagehide"));');
  assert(/UCpagehide/.test(w.localStorage.getItem('snapwb-creators')||''), 'R11: pagehide flushes the pending creator save');
  // 4) visibilitychange->hidden flushes too (iOS backgrounding path)
  w.eval('S.addedCreators=[{id:"UChidden",name:"VH"}]; persistCreators();'+
    'Object.defineProperty(document,"visibilityState",{configurable:true,get:function(){return "hidden";}});'+
    'document.dispatchEvent(new Event("visibilitychange"));'+
    'delete document.visibilityState;');
  assert(/UChidden/.test(w.localStorage.getItem('snapwb-creators')||''), 'R11: visibilitychange->hidden flushes the pending creator save');
  // 5) the done callback still fires after a manual flush (Saved ✓ chip path)
  w.eval('window.__r11done=0; sSet("snapwb-prefs", S.prefs, function(){ window.__r11done=1; }); flushSaves();');
  await sleep(30);
  assert(w.eval('window.__r11done')===1, 'R11: sSet done callback fires on flushed saves');
  // 6) keepalive is only used on hide-flush pushes AND only under the 64KiB quota
  assert(w.eval('pushFetchOpts("x".repeat(1000), true).keepalive')===true, 'R11: small hide-flush push uses keepalive');
  assert(w.eval('pushFetchOpts("x".repeat(70000), true).keepalive')===undefined, 'R11: oversized hide-flush push drops keepalive (>64KiB would THROW)');
  assert(w.eval('pushFetchOpts("x".repeat(1000), false).keepalive')===undefined, 'R11: normal in-app push never needs keepalive');
  assert(w.eval('pushFetchOpts("x".repeat(1000), true).method')==='PUT' && /Bearer/.test(w.eval('pushFetchOpts("x".repeat(10), true).headers.authorization')), 'R11: push opts keep method + auth header intact');
  // 7) byte-accurate quota check: multi-byte characters count as bytes, not string length
  assert(w.eval('pushFetchOpts("\\u00e9".repeat(40000), true).keepalive')===undefined, 'R11: quota measured in BYTES (40k two-byte chars = 80KB, keepalive dropped)');
  w.eval('S.addedCreators=[]; S.addedCreatorDecks=[]; persistCreators(); flushSaves();');

  assert(errors.length===0, 'R11: no runtime errors during the flush suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R11-UI: synergy suggestions + planner de-clunk ============
  // fieldSuggestions: pure ledger math — outside cards credited, in-deck/unknown/thin pairs skipped
  w.eval('window.__oldStats = S.creatorStats; S.creatorStats = { updated:"x", windowDays:30, deckCount:40, cards:{Hulk:10},'+
    'pairs:{ "Hulk|Wong":6, "AntMan|Hulk":3, "Hulk|Odin":2, "AbsorbingMan|Hulk":1, "Fake2099X|Wong":9 } };');
  const sugg = w.eval('fieldSuggestions([{d:"Wong"},{d:"Hulk"}], 5)');
  assert(sugg.length===2, 'R11-UI: suggestions skip in-deck pairs, thin (n<2) pairs and unknown cards ('+sugg.length+')');
  assert(sugg[0].d==='AntMan' && sugg[0].vn===3 && sugg[0].via==='Hulk', 'R11-UI: strongest outside partner ranks first (AntMan via Hulk, 3x)');
  assert(sugg[1].d==='Odin', 'R11-UI: second suggestion is Odin (2x)');
  assert(w.eval('fieldPairN("Wong","Hulk")')===6 && w.eval('fieldPairN("Hulk","Wong")')===6, 'R11-UI: fieldPairN is order-insensitive');
  // renderSynergy: Worth-a-try rows render and tapping one opens the card sheet
  w.eval('renderSynergy([S.byId["Wong"], S.byId["Hulk"]])'); await sleep(20);
  const tryRows = d.querySelectorAll('#synergy [data-syntry]');
  assert(tryRows.length===2 && tryRows[0].dataset.syntry==='AntMan', 'R11-UI: Worth-a-try section renders tappable suggestion rows');
  assert(/Worth a try/i.test(d.querySelector('#synergy').textContent), 'R11-UI: suggestions section is labelled');
  tryRows[0].click(); await sleep(20);
  assert(d.querySelector('#modalwrap').classList.contains('on') && d.querySelector('#modal .sname').textContent===w.eval('S.byId["AntMan"].n'),
    'R11-UI: tapping a suggestion opens the Ant-Man card sheet (with its Add button)');
  w.eval('closeModal()'); await sleep(10);
  // interaction rows carry partner ids so field evidence can rank them
  const inter11 = w.eval('deckInteractions([S.byId["Wong"],S.byId["WhiteTiger"],S.byId["BlackPanther"],S.byId["Odin"],S.byId["KaZar"]].filter(Boolean))');
  assert(inter11.every(r => !r.chips || !r.chips.length || (r.chipIds && r.chipIds.length===r.chips.length)),
    'R11-UI: every interaction row pairs chip names with chip ids');
  w.eval('S.creatorStats = window.__oldStats;');
  // planner: a violation explains itself on the offending turn row, not in a bottom box
  w.eval('(function(){ S.decks.unshift({id:"r11pl",name:"R11",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="r11pl";'+
    'mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],[],["Hulk"],[],[],[]]; }); })(); setTab("deck"); setDeckTab("planner"); renderPlanner();'); await sleep(20);
  const note3 = d.querySelector('#planner .pl-slot[data-t="3"] .pl-slot-note');
  assert(note3!==null && /^Spends 6 energy/.test(note3.textContent), 'R11-UI: T3 overspend note renders inside the T3 row ('+(note3?note3.textContent:'none')+')');
  assert(d.querySelector('#planner .pl-flags .warnbox')===null, 'R11-UI: no duplicate bottom warning box when notes are inline');
  w.eval('mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],[],["AntMan"],[],[],[]]; }); renderPlanner();'); await sleep(20);
  assert(d.querySelector('#planner .pl-slot-note')===null && d.querySelector('#planner .pl-flags .odds-hint')!==null,
    'R11-UI: a legal line shows the all-clear hint and zero notes');
  // manager bar: tools folded into the pills row, still labelled for screen readers
  assert(d.querySelector('#planner .pl-mgr .pl-line-tools [data-pldel]')!==null, 'R11-UI: line tools live beside the pills row');
  assert([...d.querySelectorAll('#planner .pl-line-tools .pl-line-tool')].every(b => b.getAttribute('aria-label')),
    'R11-UI: icon-only tools keep aria-labels');
  // Plan B: sentence layout keeps all three selects wired
  d.querySelector('#planner [data-pldupe]').click(); await sleep(20);
  const bsels = d.querySelectorAll('#planner .pl-branch [data-plbcard], #planner .pl-branch [data-plbturn], #planner .pl-branch [data-plbline]');
  assert(bsels.length===3, 'R11-UI: Plan B renders card + turn + line selects once a second line exists');
  w.eval('(function(){ var w2=document.querySelector("#planner .pl-branch:not(.info)");'+
    'w2.querySelector("[data-plbcard]").value="Wong"; w2.querySelector("[data-plbturn]").value="3";'+
    'var ls=w2.querySelector("[data-plbline]"); ls.value=ls.options[1].value;'+
    'ls.onchange ? ls.onchange() : ls.dispatchEvent(new Event("change")); })()'); await sleep(20);
  assert(w.eval('activeLine(activeDeck()).branch && activeLine(activeDeck()).branch.ifNot')==='Wong', 'R11-UI: Plan B selects still write the branch');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="r11pl";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(20);

  assert(errors.length===0, 'R11-UI: no runtime errors during the UI suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R11.1: the REAL vanishing-creator bug (UC-less RSS ids) + replayable cards + picker nav ============
  // normChannelId: YouTube RSS <yt:channelId> omits the UC prefix (verified against Regis's live feed)
  assert(w.eval('normChannelId("UCbt1SGMrWj5Q7TMXAfmTERQ")')==='UCbt1SGMrWj5Q7TMXAfmTERQ', 'R11.1: full UC id passes through');
  assert(w.eval('normChannelId("bt1SGMrWj5Q7TMXAfmTERQ")')==='UCbt1SGMrWj5Q7TMXAfmTERQ', 'R11.1: bare 22-char RSS id gains its UC prefix');
  assert(w.eval('normChannelId("garbage")')==='garbage' && w.eval('normChannelId("")')==='', 'R11.1: junk ids pass through unharmed');
  // addCreator against REAL-shaped XML: yt:channelId WITHOUT UC, self-link WITH — must store the UC form
  const regisXml = '<feed><link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCbt1SGMrWj5Q7TMXAfmTERQ"/>'+
    '<id>yt:channel:bt1SGMrWj5Q7TMXAfmTERQ</id><yt:channelId>bt1SGMrWj5Q7TMXAfmTERQ</yt:channelId>'+
    '<author><name>RegisKillbin</name></author>'+
    '<entry><published>'+new Date().toISOString()+'</published><title>Deck video</title>'+
    '<link rel="alternate" href="https://youtu.be/x"/>'+
    '<media:description>Deck: https://snap.untapped.gg/en/decks/Hulk-AntMan-Wong</media:description></entry></feed>';
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async()=>({ok:true,text:async()=>'+JSON.stringify(regisXml)+',json:async()=>({})});'+
    'S.addedCreators=[]; S.addedCreatorDecks=[]; await addCreator("youtube.com/@RegisKillbin"); window.fetch=of; })()');
  assert(w.eval('S.addedCreators.length')===1 && w.eval('S.addedCreators[0].id')==='UCbt1SGMrWj5Q7TMXAfmTERQ',
    'R11.1: addCreator stores the CANONICAL UC id from a real-shaped feed');
  assert(w.eval('S.addedCreatorDecks.every(d=>d.chId==="UCbt1SGMrWj5Q7TMXAfmTERQ")'), 'R11.1: harvested decks carry the same canonical id');
  // the manager must show the new creator (the old UC-guard silently hid every real add)
  w.eval('renderCreatorDecks(); openCreatorManager();'); await sleep(20);
  let regisPill11 = [...d.querySelectorAll('#modal .cr-fpill')].find(a=>/RegisKillbin/.test(a.textContent));
  assert(regisPill11 && /channel\/UCbt1SGMrWj5Q7TMXAfmTERQ/.test(regisPill11.href), 'R11.1: freshly-added creator is VISIBLE in the manager with a working channel link');
  w.eval('closeModal();'); await sleep(10);
  // healing: stored UC-less entries (saved by the buggy window, incl. synced copies) get normalized + deduped
  w.eval('S.addedCreators=[{id:"bt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"https://youtube.com/@RegisKillbin"},{id:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"x"}];'+
    'S.addedCreatorDecks=[{chId:"bt1SGMrWj5Q7TMXAfmTERQ",name:"D1",url:"u1",cards:[]}]; window.__healed=healCreatorIds();');
  assert(w.eval('window.__healed')===true, 'R11.1: healing reports changes');
  assert(w.eval('S.addedCreators.length')===1 && w.eval('S.addedCreators[0].id')==='UCbt1SGMrWj5Q7TMXAfmTERQ', 'R11.1: heal dedupes the two id forms into one channel');
  assert(w.eval('S.addedCreatorDecks[0].chId')==='UCbt1SGMrWj5Q7TMXAfmTERQ', 'R11.1: heal fixes deck chIds too');
  // a malformed-id creator STILL shows (handle fallback) — never silently hidden again
  w.eval('S.addedCreators=[{id:"weird",name:"Mystery Channel",handle:"https://youtube.com/@mystery"}]; S.addedCreatorDecks=[]; renderCreatorDecks(); openCreatorManager();'); await sleep(20);
  assert([...d.querySelectorAll('#modal .cr-fpill')].some(a=>/Mystery Channel/.test(a.textContent)), 'R11.1: even a weird-id creator stays visible via its handle link');
  w.eval('closeModal(); S.addedCreators=[]; S.addedCreatorDecks=[]; persistCreators(); flushSaves();');
  // deck rows sort newest-first so a fresh add is seen without scrolling
  w.eval('window.__oldCD=S.creatorDecks; S.creatorDecks=[{creator:"Old",published:"2026-07-01",ids:["Hulk"],url:"https://youtu.be/o"}];'+
    'S.addedCreatorDecks=[{chId:"UCbt1SGMrWj5Q7TMXAfmTERQ",creator:"New",published:"2026-07-11",ids:["Hulk"],added:true,url:"https://youtu.be/n"}]; renderCreatorDecks();'); await sleep(20);
  const crRows = [...d.querySelectorAll('#creatorlist .crow .cr-creator')].map(e=>e.textContent);
  assert(crRows[0]==='New' && crRows[1]==='Old', 'R11.1: creator deck rows render newest-first ('+crRows.join(',')+')');
  w.eval('S.creatorDecks=window.__oldCD; S.addedCreatorDecks=[]; renderCreatorDecks();'); await sleep(10);

  // --- replayable cards ---
  // the embedded snapshot predates these two cards — seed them with their LIVE cards.json wording
  w.eval('S.byId["TechnoOrganicVirus"]=S.byId["TechnoOrganicVirus"]||{n:"Techno-Organic Virus",d:"TechnoOrganicVirus",c:2,p:0,a:"On Reveal: Infect your other cards here (replace their text). Copy this to your hand."};'+
    'S.byId["ShadowlandsDaredevil"]=S.byId["ShadowlandsDaredevil"]||{n:"Shadowlands Daredevil",d:"ShadowlandsDaredevil",c:2,p:3,a:"On Reveal: Shuffle in 3 Demons. When you draw a card with 6 or more Power, +2 Power."};');
  assert(w.eval('isReplayable("KittyPryde", {cards:[]})')===true, 'R11.1: Kitty Pryde (returns each turn) is replayable');
  assert(w.eval('isReplayable("TechnoOrganicVirus", {cards:[]})')===true, 'R11.1: Techno-Organic Virus (copies itself) is replayable');
  assert(w.eval('isReplayable("Hulk", {cards:[]})')===false, 'R11.1: Hulk is not replayable');
  assert(w.eval('isReplayable("Demon", {cards:["ShadowlandsDaredevil"]})')===true, 'R11.1: Demon repeats when Shadowlands Daredevil (shuffle in 3) is in the deck');
  assert(w.eval('isReplayable("Demon", {cards:["Hood"]})')===false, 'R11.1: a single-copy Demon producer does not make it repeatable');
  assert(w.eval('isReplayable("Squirrel", {cards:["SquirrelGirl"]})')===false, 'R11.1: Squirrel stays single-placement');
  // picker: Kitty can sit on several turns; a normal card still MOVES
  w.eval('(function(){ S.decks.unshift({id:"r111pl",name:"Rep",cards:["KittyPryde","Hulk","AntMan","Wong"],updated:Date.now()}); S.activeId="r111pl"; })(); setTab("deck"); setDeckTab("planner"); renderPlanner(); openPlPicker(1);'); await sleep(20);
  d.querySelector('#pl-pick-grid .mini[data-d="KittyPryde"]').click(); await sleep(20);
  w.eval('S.plannerTurn=3; refreshPlPicker();'); await sleep(20);
  d.querySelector('#pl-pick-grid .mini[data-d="KittyPryde"]').click(); await sleep(20);
  assert(w.eval('currentLine(activeDeck())[0].indexOf("KittyPryde")>=0 && currentLine(activeDeck())[2].indexOf("KittyPryde")>=0',),
    'R11.1: Kitty rides BOTH T1 and T3');
  const repTag = d.querySelector('#pl-pick-grid .mini[data-d="KittyPryde"] .pl-tag.rep, #pl-pick-grid .pl-tag.rep');
  w.eval('S.plannerTurn=5; refreshPlPicker();'); await sleep(20);
  assert(d.querySelector('#pl-pick-grid .mini[data-d="KittyPryde"]')!==null && d.querySelector('#pl-pick-grid .pl-tag.rep')!==null,
    'R11.1: on another turn Kitty wears the repeatable ↺ tag, not the greyed elsewhere state');
  assert(d.querySelector('#pl-pick-grid .mini[data-d="KittyPryde"].elsewhere')===null, 'R11.1: repeatable card is never greyed out');
  d.querySelector('#pl-pick-grid .mini[data-d="Hulk"]').click(); await sleep(20);
  w.eval('S.plannerTurn=6; refreshPlPicker();'); await sleep(20);
  d.querySelector('#pl-pick-grid .mini[data-d="Hulk"]').click(); await sleep(20);
  assert(w.eval('currentLine(activeDeck())[4].indexOf("Hulk")<0 && currentLine(activeDeck())[5].indexOf("Hulk")>=0'),
    'R11.1: a normal card still MOVES between turns (T5 -> T6)');
  // draw math counts a replayed card once
  assert(w.eval('cumDraws([["KittyPryde"],["KittyPryde"],["KittyPryde","Hulk"],[],[],[]]).join()')==='1,1,2,2,2,2',
    'R11.1: cumulative draws count Kitty once no matter how often she replays');
  assert(w.eval('lineFlags([["KittyPryde"],["KittyPryde"],["KittyPryde"],["KittyPryde"],["KittyPryde"],["KittyPryde"]],[0,0,0,0,0,0],activeDeck()).filter(f=>f.type==="draw").length')===0,
    'R11.1: Kitty-every-turn raises no draw violations');
  // picker ‹ › nav
  w.eval('S.plannerTurn=1; refreshPlPicker();'); await sleep(10);
  assert(d.querySelector('#pl-prev').disabled===true && d.querySelector('#pl-next').disabled===false, 'R11.1: prev disabled on T1');
  d.querySelector('#pl-next').click(); await sleep(20);
  assert(w.eval('S.plannerTurn')===2 && /^T2$/.test(d.querySelector('#pl-picker-title').textContent.trim()), 'R11.1: › hops the sheet to T2 without closing (compact T2 title)');
  w.eval('S.plannerTurn=6; refreshPlPicker();'); await sleep(10);
  assert(d.querySelector('#pl-next').disabled===true, 'R11.1: next disabled on T6');
  w.eval('closePlPicker(true); S.decks=S.decks.filter(function(x){return x.id!=="r111pl";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(20);

  assert(errors.length===0, 'R11.1: no runtime errors during the suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R11.2: deck dedupe, creator filter, expected-cost overrides ============
  // healing collapses the SAME deck saved under both id forms (the "seeing his decks twice" bug)
  w.eval('S.addedCreators=[{id:"bt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"h"}];'+
    'S.addedCreatorDecks=[{chId:"bt1SGMrWj5Q7TMXAfmTERQ",name:"Rama-Tut",url:"https://youtu.be/x",cards:[]},'+
    '{chId:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"Rama-Tut",url:"https://youtu.be/x",cards:[]},'+
    '{chId:"UCbt1SGMrWj5Q7TMXAfmTERQ",name:"Other Deck",url:"https://youtu.be/y",cards:[]}]; window.__h2=healCreatorIds();');
  assert(w.eval('window.__h2')===true && w.eval('S.addedCreatorDecks.length')===2,
    'R11.2: heal dedupes decks saved under both id forms (3 -> 2)');
  assert(w.eval('S.addedCreatorDecks.every(d=>d.chId==="UCbt1SGMrWj5Q7TMXAfmTERQ")'), 'R11.2: surviving decks carry the canonical id');
  // re-adding a creator replaces decks stored under the OLD id form (no doubles on re-add)
  w.eval('S.addedCreators=[{id:"bt1SGMrWj5Q7TMXAfmTERQ",name:"RegisKillbin",handle:"h"}];'+
    'S.addedCreatorDecks=[{chId:"bt1SGMrWj5Q7TMXAfmTERQ",name:"Old Copy",url:"u",cards:[]}];');
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async()=>({ok:true,text:async()=>'+JSON.stringify(regisXml)+',json:async()=>({})});'+
    'await addCreator("youtube.com/@RegisKillbin"); window.fetch=of; })()');
  assert(w.eval('S.addedCreators.length')===1 && w.eval('S.addedCreatorDecks.every(d=>d.name!=="Old Copy")'),
    'R11.2: re-add replaces old-form entries instead of doubling them');
  // creator filter: tap a manager row -> only that creator's rows (modal closes); the pane chip clears it
  w.eval('window.__oldCD2=S.creatorDecks; S.creatorDecks=[{creator:"Alexander Coccia",published:"2026-07-10",ids:["Hulk"],url:"https://youtu.be/a"},'+
    '{creator:"Coougarrr",published:"2026-07-09",ids:["Wong"],url:"https://youtu.be/b"}]; S.addedCreatorDecks=[]; S.crFilter=null; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelectorAll('#creatorlist .crow').length===2, 'R11.2: unfiltered pane shows both rows');
  d.querySelector('#btn-managecr').click(); await sleep(20);
  const cocPill = [...d.querySelectorAll('#modal .cr-fpill')].find(a=>/Alexander Coccia/.test(a.textContent));
  cocPill.click(); await sleep(20);
  assert(w.eval('S.crFilter')==='Alexander Coccia', 'R11.2: tapping a manager row sets the filter');
  assert(!d.getElementById('modalwrap').classList.contains('on'), 'R11.2: picking a filter closes the manager');
  const fRows = [...d.querySelectorAll('#creatorlist .crow .cr-creator')].map(e=>e.textContent);
  assert(fRows.length===1 && fRows[0]==='Alexander Coccia', 'R11.2: filtered pane shows only that creator');
  const fchip = d.querySelector('#creatorlist .cr-filterchip');
  assert(fchip!==null && /Alexander Coccia/.test(fchip.textContent), 'R11.2: the active filter shows as a chip in the pane');
  fchip.click(); await sleep(20);
  assert(w.eval('S.crFilter')===null && d.querySelectorAll('#creatorlist .crow').length===2, 'R11.2: the chip clears the filter');
  d.querySelector('#btn-managecr').click(); await sleep(20);
  assert([...d.querySelectorAll('#modal .cr-fpill')].every(a=>/^https:\/\/www\.youtube\.com\//.test(a.href)||/youtube\.com/.test(a.href)),
    'R11.2: manager rows keep their channel hrefs for the ↗ link');
  w.eval('closeModal(); S.creatorDecks=window.__oldCD2; S.addedCreatorDecks=[]; S.addedCreators=[]; S.crFilter=null; persistCreators(); flushSaves(); renderCreatorDecks();'); await sleep(10);

  // --- expected-cost overrides ---
  assert(w.eval('costOf("Hulk", null)')===6 && w.eval('costOf("Hulk", {costs:{Hulk:3}})')===3, 'R11.2: costOf honors the override, defaults to printed');
  const nl2 = w.eval('normLineObj({turns:[["Hulk"]], costs:{Hulk:3, Bad:"x", Neg:-2, Big:99}})');
  assert(nl2.costs && nl2.costs.Hulk===3 && nl2.costs.Bad===undefined && nl2.costs.Neg===undefined && nl2.costs.Big===undefined,
    'R11.2: normLineObj keeps sane cost overrides and drops garbage (sync-safe)');
  assert(w.eval('lineFlags([[],[],["Hulk"],[],[],[]],[0,0,0,0,0,0],activeDeck()).some(f=>f.type==="energy")')===true,
    'R11.2: Hulk on T3 at printed cost still flags');
  assert(w.eval('lineFlags([[],[],["Hulk"],[],[],[]],[0,0,0,0,0,0],activeDeck(),{Hulk:3}).some(f=>f.type==="energy")')===false,
    'R11.2: with an expected cost of 3 the flag clears');
  // UI: tap the ⚡ chip -> editor opens; − adjusts; chip shows ≈
  w.eval('(function(){ S.decks.unshift({id:"r112pl",name:"Cost",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="r112pl";'+
    'mutateActiveLine(activeDeck(), function(lo){ lo.turns=[[],[],["Hulk"],[],[],[]]; }); })(); setTab("deck"); setDeckTab("planner"); renderPlanner();'); await sleep(20);
  d.querySelector('#planner .pl-slot[data-t="3"] [data-costs]').click(); await sleep(20);
  assert(d.querySelector('#modalwrap').classList.contains('on') && /what will these cost/i.test(d.querySelector('#modal h2').textContent),
    'R11.2: tapping the ⚡ chip opens the real-cost editor');
  for(let i=0;i<3;i++){ d.querySelector('#modal .cost-row[data-cid="Hulk"] .cost-b[data-cd="-1"]').click(); await sleep(15); }
  assert(w.eval('activeLine(activeDeck()).costs.Hulk')===3, 'R11.2: three taps of − take Hulk from 6 to an expected 3');
  assert(/printed 6/.test(d.querySelector('#modal .cost-row[data-cid="Hulk"]').textContent), 'R11.2: the editor shows the printed cost for reference');
  w.eval('closeModal()'); await sleep(10);
  const chip3 = d.querySelector('#planner .pl-slot[data-t="3"] [data-costs]');
  assert(/≈3\/3⚡/.test(chip3.textContent), 'R11.2: the turn chip shows ≈3/3⚡ ('+chip3.textContent+')');
  assert(d.querySelector('#planner .pl-slot[data-t="3"] .pl-slot-note')===null, 'R11.2: the T3 violation note is gone at the expected cost');
  // the override rides a duplicated line
  d.querySelector('#planner [data-pldupe]').click(); await sleep(20);
  assert(w.eval('activeLine(activeDeck()).costs.Hulk')===3, 'R11.2: duplicating a line carries the expected costs');
  // reset restores printed costs
  d.querySelector('#planner .pl-slot[data-t="3"] [data-costs]').click(); await sleep(20);
  d.querySelector('#cost-reset').click(); await sleep(20);
  assert(w.eval('!activeLine(activeDeck()).costs'), 'R11.2: reset clears the overrides for that turn');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="r112pl";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(20);

  assert(errors.length===0, 'R11.2: no runtime errors during the suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R11.3: Hoogland — monthly deck-dump creators + labelled untapped links ============
  // real description shape: "Bishop Venus: https://snap.untapped.gg/en/decks/…" — label wins over slug
  const hoogDesc = 'Daily Marvel SNAP Deck Highlights:\nhttps://www.youtube.com/@JeffHoogland/videos\n\n'+
    'Bishop Venus: https://snap.untapped.gg/en/decks/Angela-Bishop-ElsaBloodstone-HopeSummers-JeffTheBabyDolphin-JeffTheBabyLandShark-KittyPryde-MotherAskani-NicoMinoru-Nightcrawler-SpiderMan-Venus_Venus\n'+
    'Venus Movers: https://snap.untapped.gg/en/decks/Angela-Cosmo-ElsaBloodstone-JeffTheBabyDolphin-JeffTheBabyLandShark-Kraven-Nightcrawler-RocketAndGroot-SamWilson-ScarletWitch-Stardust-Venus_Venus';
  const hoog = w.eval('extractDecksFromDesc(' + JSON.stringify(hoogDesc) + ')');
  assert(hoog.length===2 && hoog[0].ids.length===12 && hoog[1].ids.length===12, 'R11.3: both labelled untapped links extract 12-card decks');
  assert(hoog[0].name==='Bishop Venus' && hoog[1].name==='Venus Movers', 'R11.3: deck names come from the creator\'s labels, not the shared slug ('+hoog[0].name+', '+hoog[1].name+')');
  // 30-day window: a 20-day-old deck video counts (was filtered at 14 days); a 40-day-old one does not
  const mkEntry = (daysAgo, url) => '<entry><published>' + new Date(Date.now()-daysAgo*86400000).toISOString() + '</published>'+
    '<title>Deck video ' + daysAgo + 'd</title><link rel="alternate" href="https://youtu.be/v' + daysAgo + '"/>'+
    '<media:description>My Deck: ' + url + '</media:description></entry>';
  const hoogXml = '<feed><link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx"/>'+
    '<yt:channelId>xxxxxxxxxxxxxxxxxxxxxx</yt:channelId><author><name>HooglandiaSnap</name></author>'+
    mkEntry(20, 'https://snap.untapped.gg/en/decks/Hulk-AntMan-Wong_Test') + mkEntry(40, 'https://snap.untapped.gg/en/decks/Odin-Wong-Hulk_Old') + '</feed>';
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async()=>({ok:true,text:async()=>'+JSON.stringify(hoogXml)+',json:async()=>({})});'+
    'S.addedCreators=[]; S.addedCreatorDecks=[]; await addCreator("youtube.com/@HooglandiaSnap"); window.fetch=of; })()');
  assert(w.eval('S.addedCreatorDecks.length')===1 && w.eval('S.addedCreatorDecks[0].name')==='My Deck',
    'R11.3: a 20-day-old deck video lands (was filtered at 14 days); a 40-day-old one stays out');
  assert(w.eval('S.addedCreators.length')===1 && w.eval('S.addedCreators[0].name')==='HooglandiaSnap', 'R11.3: the channel itself is followed');
  // no-codes message mentions how far the scan reaches
  await w.eval('(async()=>{ const of=window.fetch; window.fetch=async()=>({ok:true,text:async()=>'+JSON.stringify(
    '<feed><link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCyyyyyyyyyyyyyyyyyyyyyy"/><author><name>NoCodes</name></author>'+
    '<entry><published>2026-07-10T00:00:00Z</published><title>t</title><media:description>just chatting</media:description></entry></feed>')+',json:async()=>({})});'+
    'openAddCreator(); await addCreator("youtube.com/@NoCodes"); window.fetch=of; })()'); await sleep(20);
  const ncMsg = d.querySelector('#cr-msg');
  assert(ncMsg && /30 days/.test(ncMsg.textContent) && /comments/.test(ncMsg.textContent), 'R11.3: the no-codes message explains the 30-day / ~15-video reach');
  w.eval('closeModal(); S.addedCreators=[]; S.addedCreatorDecks=[]; persistCreators(); flushSaves();');

  assert(errors.length===0, 'R11.3: no runtime errors during the suite'+(errors.length?' -> '+errors.join(' | '):''));

  // ============ R12: buildability, version memory, locations ============
  // --- A: creator-deck buildability ---
  w.eval('window.__oldOwned = S.owned; window.__oldCD3 = S.creatorDecks;'+
    'S.owned = new Set(["Hulk","AntMan","Wong","Odin","Psylocke","Mystique","IronMan","KaZar","Wolfsbane","Ironheart","Sunspot"]);'+
    'S.creatorDecks = ['+
    '{creator:"Full Guy",published:"2026-07-10",url:"https://youtu.be/f",ids:["Hulk","AntMan","Wong"]},'+
    '{creator:"Close Guy",published:"2026-07-09",url:"https://youtu.be/c",ids:["Hulk","AntMan","BlackPanther"]},'+
    '{creator:"Far Guy",published:"2026-07-08",url:"https://youtu.be/x",ids:["BlackPanther","WhiteTiger","ArnimZola","Daredevil","Angela","Bishop"]}];'+
    'S.addedCreatorDecks=[]; S.crFilter=null; S.prefs.crBuildable=false; renderCreatorDecks();'); await sleep(20);
  const ownChips = [...d.querySelectorAll('#creatorlist .cr-own')].map(e=>e.textContent);
  assert(ownChips.length===3 && ownChips[0]==='✓ buildable' && ownChips[1]==='own 2/3', 'R12-A: own-count chips render per row ('+ownChips.join(' | ')+')');
  const missTxt = [...d.querySelectorAll('#creatorlist .cr-missing')].map(e=>e.textContent);
  assert(missTxt.length===2 && /Missing: Black Panther$/.test(missTxt[0]), 'R12-A: missing cards named ('+missTxt[0]+')');
  assert(/\+3 more/.test(missTxt[1]), 'R12-A: long missing lists truncate to +N more ('+missTxt[1]+')');
  d.querySelector('#cr-buildable').click(); await sleep(20);
  assert(w.eval('S.prefs.crBuildable')===true && d.querySelectorAll('#creatorlist .crow').length===1, 'R12-A: Buildable-only shows just the fully-owned deck');
  d.querySelector('#cr-buildable').click(); await sleep(20);
  assert(d.querySelectorAll('#creatorlist .crow').length===3, 'R12-A: untoggle restores all rows');
  w.eval('window.__t=S.owned; S.owned=new Set(); renderCreatorDecks();'); await sleep(20);
  assert(d.querySelector('#creatorlist .cr-own')===null && d.querySelector('#cr-buildable')===null, 'R12-A: no collection marked -> no chips, no toggle');
  w.eval('S.owned=window.__t; S.creatorDecks=window.__oldCD3; renderCreatorDecks();'); await sleep(10);

  // --- B: version memory ---
  w.eval('S.decks.unshift({id:"r12v",name:"Versions",cards:["Hulk","AntMan","Wong","Odin"],updated:Date.now()}); S.activeId="r12v";');
  w.eval('finishDeck()'); await sleep(20);
  assert(w.eval('(S.decks.find(x=>x.id==="r12v").vers||[]).length')===1, 'R12-B: Done creates v1');
  w.eval('S.activeId="r12v"; finishDeck()'); await sleep(20);
  assert(w.eval('S.decks.find(x=>x.id==="r12v").vers.length')===1, 'R12-B: Done again with the same cards does NOT duplicate');
  w.eval('(function(){ const dd=S.decks.find(x=>x.id==="r12v"); S.activeId="r12v"; dd.cards=["Hulk","AntMan","Wong","Psylocke"]; touch(dd); })(); finishDeck()'); await sleep(20);
  assert(w.eval('S.decks.find(x=>x.id==="r12v").vers.length')===2, 'R12-B: Done after a card swap creates v2');
  // verdict stamps the version you played
  w.eval('S.activeId="r12v"; renderAll(); setTab("deck");'); await sleep(20);
  d.querySelector('#verdictrow [data-verdict="good"]').click(); await sleep(20);
  assert(w.eval('S.decks.find(x=>x.id==="r12v").vers[1].verdict')==='good', 'R12-B: verdict lands on the matching latest version');
  // rating an EDITED deck checkpoints it first
  w.eval('(function(){ const dd=activeDeck(); dd.cards=["Hulk","AntMan","Wong","Mystique"]; touch(dd); })();'); await sleep(10);
  d.querySelector('#verdictrow [data-verdict="bad"]').click(); await sleep(20);
  const vers3 = w.eval('S.decks.find(x=>x.id==="r12v").vers');
  assert(vers3.length===3 && vers3[2].verdict==='bad' && vers3[1].verdict==='good', 'R12-B: rating an edited deck auto-checkpoints v3 with its own verdict');
  // history UI: rows newest-first with restore
  const vRows = d.querySelectorAll('#deckvers .ver-row');
  assert(vRows.length===3 && vRows[0].querySelector('.ver-n').textContent==='v3', 'R12-B: history renders newest first ('+vRows.length+' rows)');
  assert(/same as current/.test(vRows[0].textContent) && vRows[0].querySelector('[data-restore]')===null, 'R12-B: current version offers no Restore');
  const r1 = [...vRows].find(r=>r.querySelector('.ver-n').textContent==='v1');
  assert(r1 && /had /.test(r1.textContent), 'R12-B: older versions name their differing cards');
  r1.querySelector('[data-restore]').click(); await sleep(20);
  assert(w.eval('activeDeck().cards.indexOf("Odin")>=0 && activeDeck().cards.indexOf("Mystique")<0'), 'R12-B: Restore brings v1 cards back');
  assert(w.eval('activeDeck().done')!==true, 'R12-B: restoring re-opens the deck for editing');
  // cap at 10
  w.eval('(function(){ const dd=activeDeck(); for(let i=0;i<14;i++){ dd.cards=["Hulk","AntMan","Wong","T"+i]; checkpointDeck(dd); } })()');
  assert(w.eval('activeDeck().vers.length')===10, 'R12-B: version history caps at 10');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="r12v";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(10);

  // --- C: locations ---
  const LOCJ = { updated:'2026-07-11', cards: _mkCards(80), locations: [
    { n:'Altar of Death', d:'AltarOfDeath', a:'After you play a card here, destroy it to get +2 Energy next turn.', r:'rare', i:'https://x/altar.webp' },
    { n:'Asgard', d:'Asgard', a:'After turn 4, whoever is winning here draws 2 cards.', r:'common' },
    { n:'Bad', d:'', a:'no id -> dropped' } ] };
  await w.eval('(async()=>{ window.__oldDb=S.db; const of=window.fetch; window.fetch=async()=>({ok:true,json:async()=>('+JSON.stringify(LOCJ)+')}); window.__l1=await loadSiteData(); window.fetch=of; })()');
  assert(w.eval('window.__l1')===true && w.eval('S.locations.length')===2, 'R12-C: locations ride cards.json intake (bad entries dropped)');
  w.eval('S.prefs.featLoc=null; S.locSearch=""; renderCollection();'); await sleep(20);
  assert(d.querySelectorAll('#loclist .loc-row').length===2, 'R12-C: locations reference renders on the Cards tab');
  assert(/tap it here and mark it/.test(d.querySelector('#loclist').textContent), 'R12-C: no featured pick -> the weekly hint shows');
  // search
  w.eval('S.locSearch="asgard"; renderLocations();'); await sleep(10);
  assert(d.querySelectorAll('#loclist .loc-row').length===1, 'R12-C: search narrows the list');
  w.eval('S.locSearch=""; renderLocations();'); await sleep(10);
  // featured pick flow
  d.querySelector('#loclist .loc-row[data-locd="AltarOfDeath"]').click(); await sleep(20);
  assert(/Altar of Death/.test(d.querySelector('#modal h2').textContent), 'R12-C: tapping a location opens its sheet');
  d.querySelector('#loc-feat-btn').click(); await sleep(20);
  assert(w.eval('S.prefs.featLoc && S.prefs.featLoc.d')==='AltarOfDeath', 'R12-C: marking featured persists the pick');
  assert(d.querySelector('#loclist .loc-feat')!==null && /Featured this week: Altar of Death/.test(d.querySelector('#loclist .loc-feat').textContent),
    'R12-C: the featured banner renders');
  assert(w.eval('featuredLoc().n')==='Altar of Death', 'R12-C: featuredLoc() resolves the pick (feeds the coach)');
  w.eval('S.prefs.featLoc.at = Date.now() - 11*86400000;');
  assert(w.eval('featuredLoc()')===null, 'R12-C: an 11-day-old pick self-expires');
  w.eval('S.prefs.featLoc=null; S.locations=[]; S.db=window.__oldDb; renderCollection();'); await sleep(10);
  assert(d.querySelector('#loclist .loc-row')===null, 'R12-C: no locations data -> the section hides entirely');

  /* ============ R13: Library rename + library search/sort/filter + creator card search ============ */
  // --- A: the 5th tab is Library (it holds cards AND locations now) ---
  assert(d.querySelector('#tabbar [data-tab="collection"]').textContent.trim()==='Library', 'R13-A: 5th tab is labelled Library');

  // --- B: the Library grid obeys the global search/sort/filter cluster ---
  w.eval('S.db=DB_BASE.slice(); indexDb(); applyTokenData();');   // earlier intake mocks left an 80-card db behind
  w.eval('S.sort="cost"; clearAllFilters(); setTab("collection"); setLibPage("cards");'); await sleep(20);
  assert(d.body.classList.contains('on-cards'), 'R13-B: search/sort/filter cluster is available on Library’s Cards page');
  const libAll = d.querySelectorAll('#colllist .tile').length;
  assert(libAll===w.eval('S.db.length'), 'R13-B: unfiltered Library shows the whole db ('+libAll+')');
  w.eval('S.filters.q="hulk"; renderCollection();'); await sleep(20);
  const hulkN = w.eval('filteredCards().length');
  assert(hulkN>0 && hulkN<libAll && d.querySelectorAll('#colllist .tile').length===hulkN,
    'R13-B: search narrows the Library grid ('+hulkN+' hulk matches)');
  assert(/of \d+ cards match/.test(d.querySelector('#coll-match').textContent), 'R13-B: match hint renders while narrowed');
  assert([...d.querySelectorAll('#colllist .coll-grid')].every(g=>g.querySelector('.tile')), 'R13-B: series sections without matches are hidden');
  // in-place flip meta refresh recounts the SHOWN subset, not the full db
  const sec0 = d.querySelector('#colllist .coll-section[data-series]');
  const gridN = sec0.nextElementSibling.querySelectorAll('.tile').length;
  w.eval('syncCollMeta()');
  assert(sec0.querySelector('.cs-n').textContent.endsWith('/'+gridN), 'R13-B: section counts track the filtered subset ('+sec0.querySelector('.cs-n').textContent+')');
  // facet filters flow through afterFilterChange while Library is the active tab
  w.eval('S.filters.q=""; S.filters.cost.add("6"); afterFilterChange();'); await sleep(20);
  const sixN = w.eval('filteredCards().length');
  assert(sixN>0 && d.querySelectorAll('#colllist .tile').length===sixN, 'R13-B: facet filters narrow the Library too ('+sixN+' at 6+ cost)');
  // sort applies inside each section
  w.eval('S.sort="power"; renderCollection();'); await sleep(20);
  const powOrder = w.eval('(function(){var g=document.querySelector("#colllist .coll-grid");'+
    'var t=[].slice.call(g.querySelectorAll(".tile")).map(function(e){return getCard(e.dataset.d).p;});'+
    'for(var i=1;i<t.length;i++){if(t[i-1]<t[i])return false;}return true;})()');
  assert(powOrder, 'R13-B: Power sort orders a section power-descending');
  // zero matches -> explanatory empty state
  w.eval('S.filters.q="zzz-no-card-ever"; renderCollection();'); await sleep(10);
  assert(d.querySelectorAll('#colllist .tile').length===0 && /Nothing in the library matches/.test(d.querySelector('#coll-match').textContent),
    'R13-B: zero matches -> empty-state hint, no ghost sections');
  w.eval('S.sort="cost"; clearAllFilters();'); await sleep(20);
  assert(d.querySelectorAll('#colllist .tile').length===libAll && d.querySelector('#coll-match')===null, 'R13-B: clearing restores the full Library');
  w.eval('setTab("cards");'); await sleep(10);

  // --- C: creator card search ---
  w.eval('window.__oldCD4 = S.creatorDecks;'+
    'S.creatorDecks = ['+
    '{creator:"Wong Guy",published:"2026-07-10",url:"https://youtu.be/w",ids:["Wong","Odin","IronMan"]},'+
    '{creator:"Move Guy",published:"2026-07-09",url:"https://youtu.be/m",ids:["Hulk","AntMan","BlackPanther"]}];'+
    'S.addedCreatorDecks=[]; S.crFilter=null; S.crCardQ=""; S.prefs.crBuildable=false; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelector('#cr-cardq')!==null, 'R13-C: card search input renders above creator decks');
  assert(d.querySelectorAll('#creatorlist .crow').length===2, 'R13-C: empty query shows all decks');
  w.eval('S.crCardQ="wong"; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelectorAll('#creatorlist .crow').length===1, 'R13-C: query keeps only decks playing the card');
  assert(d.querySelector('#creatorlist .cr-strip').classList.contains('q'), 'R13-C: strip enters highlight mode');
  const crHit = d.querySelector('#creatorlist .cr-strip .mini.hit');
  assert(crHit && crHit.dataset.d==='Wong', 'R13-C: the searched card is the highlighted mini');
  assert(d.querySelectorAll('#creatorlist .cr-strip .mini:not(.hit)').length===2, 'R13-C: deckmates stay unhighlighted');
  assert(/1 deck plays/.test(d.querySelector('.cr-search .odds-hint').textContent), 'R13-C: hit-count hint renders');
  assert(d.querySelector('#cr-cardq').value==='wong', 'R13-C: input keeps its query across the re-render');
  // the real typing path (debounced input event)
  const crQi = d.querySelector('#cr-cardq');
  crQi.value='ant man';
  crQi.dispatchEvent(new w.Event('input', {bubbles:true})); await sleep(260);
  assert(w.eval('S.crCardQ')==='ant man' && d.querySelectorAll('#creatorlist .crow').length===1
    && d.querySelector('#creatorlist .cr-strip .mini.hit').dataset.d==='AntMan', 'R13-C: typing filters after the debounce');
  // zero matches keeps the input and says so
  w.eval('S.crCardQ="zzznope"; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelector('#cr-cardq')!==null && /No creator decks are playing/.test(d.querySelector('#creatorlist .warnbox').textContent),
    'R13-C: zero matches keeps the input and explains');
  // composes with the creator pill filter (pill first, then card query)
  w.eval('S.crCardQ="hulk"; S.crFilter="Wong Guy"; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelectorAll('#creatorlist .crow').length===0 && d.querySelector('#creatorlist .warnbox')!==null,
    'R13-C: card query composes with the creator filter');
  w.eval('S.crFilter=null; S.crCardQ=""; S.creatorDecks=window.__oldCD4; renderCreatorDecks();'); await sleep(10);

  /* ============ R14: trending cards from the dated ledger ============ */
  // Fixture: anchor = 07-10 (newest entry), 7-day cut = 07-03. Recent 6 decks, prior 10.
  // Expected: Wong rises (3/6 vs 0, NEW), Hulk rises (4/6 vs 2/10), Mystique rises (2/6 vs 2/10);
  // Odin + Psylocke cool (4/10 each, absent this week); IronMan flat (2/6 vs 4/10); AntMan r=1 ignored.
  w.eval('window.__oldCS = S.creatorStats;'+
    'S.creatorStats = { deckCount: 16, windowDays: 30, cards: {}, pairs: {}, ledger: ['+
    '{published:"2026-07-10",ids:["Wong","Hulk"]},'+
    '{published:"2026-07-09",ids:["Wong","Hulk","Mystique"]},'+
    '{published:"2026-07-08",ids:["Wong","Hulk"]},'+
    '{published:"2026-07-07",ids:["Hulk","Mystique"]},'+
    '{published:"2026-07-06",ids:["AntMan","IronMan"]},'+
    '{published:"2026-07-05",ids:["IronMan","KaZar"]},'+
    '{published:"2026-06-30",ids:["Odin","IronMan"]},'+
    '{published:"2026-06-29",ids:["Odin","IronMan"]},'+
    '{published:"2026-06-28",ids:["Odin","IronMan"]},'+
    '{published:"2026-06-27",ids:["Odin","IronMan"]},'+
    '{published:"2026-06-26",ids:["Hulk","KaZar"]},'+
    '{published:"2026-06-25",ids:["Hulk","KaZar"]},'+
    '{published:"2026-06-24",ids:["Mystique","Psylocke"]},'+
    '{published:"2026-06-23",ids:["Mystique","Psylocke"]},'+
    '{published:"2026-06-22",ids:["Psylocke","KaZar"]},'+
    '{published:"2026-06-21",ids:["Psylocke","KaZar"]}]};'+
    'renderCreatorDecks();'); await sleep(20);
  const tt = w.eval('trendingCards()');
  assert(tt && tt.recN===6 && tt.prevN===10, 'R14: window split off the anchor date (6 recent / 10 prior)');
  assert(tt.risers.length===3 && tt.risers[0].d==='Wong' && tt.risers[0].isNew===true, 'R14: Wong tops the risers and is flagged new');
  assert(tt.risers[1].d==='Hulk' && tt.risers[1].isNew===false && tt.risers[2].d==='Mystique', 'R14: Hulk then Mystique follow, not new');
  assert(!tt.risers.some(x=>x.d==='IronMan') && !tt.risers.some(x=>x.d==='AntMan'), 'R14: flat cards and single-deck blips do not trend');
  assert(tt.coolers.some(x=>x.d==='Odin') && tt.coolers.some(x=>x.d==='Psylocke'), 'R14: absent-this-week staples cool off');
  const tbox = d.querySelector('#creatorlist .trend-box');
  assert(tbox!==null && tbox.querySelectorAll('.trend-row').length===3, 'R14: trending panel renders above the deck rows');
  assert(tbox.querySelector('.trend-row').dataset.d==='Wong' && tbox.querySelector('.trend-row .trend-new')!==null, 'R14: top row is Wong with the new badge');
  assert(/in 3 of 6/.test(tbox.querySelector('.trend-chip').textContent), 'R14: riser chip states its evidence (3 of 6 decks)');
  assert(/Cooling off:/.test(tbox.querySelector('.trend-cool').textContent) && /Odin/.test(tbox.querySelector('.trend-cool').textContent), 'R14: cooling line names the fading staples');
  tbox.querySelector('.trend-row[data-d="Wong"]').click(); await sleep(20);
  assert(d.querySelector('#modalwrap').classList.contains('on') && d.querySelector('#modal .sname').textContent==='Wong', 'R14: tapping a trend row opens the card sheet');
  w.eval('closeModal()'); await sleep(10);
  // thin/absent data hides the panel entirely
  w.eval('S.creatorStats.ledger = S.creatorStats.ledger.slice(0,5); renderCreatorDecks();'); await sleep(20);
  assert(w.eval('trendingCards()')===null && d.querySelector('#creatorlist .trend-box')===null, 'R14: a thin ledger renders no panel');
  w.eval('S.creatorStats = { deckCount: 5, windowDays: 30, cards: {}, pairs: {} }; renderCreatorDecks();'); await sleep(20);
  assert(d.querySelector('#creatorlist .trend-box')===null, 'R14: pre-R14 stats shape (no ledger) renders no panel');
  w.eval('S.creatorStats = window.__oldCS; renderCreatorDecks();'); await sleep(10);

  /* ============ R15: exact line-consistency odds ============ */
  // Hand-computed truths over a 12-card shuffle (seen by turn t = 3+t):
  //   one card @T3 -> 6/12 = .5 ; A@T1,B@T2 -> (4/12)(4/11) = 4/33 ; five @T1 -> C(4,5)=0
  //   branch A{Wong@3} else B{Hulk@3} -> .5 + .5 - C(6,2)/C(12,2) = 1 - 15/66 = 51/66
  w.eval('S.decks.unshift({id:"r15",name:"Sim",cards:["Wong","Hulk","AntMan","Odin","Mystique","Psylocke","IronMan","KaZar","Ironheart","Sunspot","Wolfsbane","WhiteTiger"],updated:Date.now()}); S.activeId="r15"; renderAll();'); await sleep(20);
  const near = (x, v) => Math.abs(x - v) < 1e-9;
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[[],[],["Wong"],[],[],[]]; }); })()');
  assert(near(w.eval('assembleOdds(activeDeck(), activeLine(activeDeck())).p'), 0.5), 'R15: one card by T3 = 6/12 exactly');
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[["Wong"],["Hulk"],[],[],[],[]]; }); })()');
  assert(near(w.eval('assembleOdds(activeDeck(), activeLine(activeDeck())).p'), 4/33), 'R15: chained turns multiply conditionally (4/33)');
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[["Wong","Hulk","AntMan","Odin","Mystique"],[],[],[],[],[]]; }); })()');
  assert(w.eval('assembleOdds(activeDeck(), activeLine(activeDeck())).p')===0, 'R15: five cards by T1 is impossible (0)');
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[[],["Wong"],[],["Wong"],[],[]]; }); })()');
  assert(near(w.eval('assembleOdds(activeDeck(), activeLine(activeDeck())).p'), 5/12), 'R15: a replayed card counts once, at its earliest turn');
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[[],[],["Wong","NotACard2026"],[],[],[]]; }); })()');
  assert(near(w.eval('assembleOdds(activeDeck(), activeLine(activeDeck())).p'), 0.5), 'R15: ids not in the 12 are ignored by the math');
  // branch policy odds
  w.eval('(function(){ const d=activeDeck(); materializeLines(d);'+
    'd.lines=[{id:"LA",name:"A",turns:[[],[],["Wong"],[],[],[]],adj:[0,0,0,0,0,0],branch:{ifNot:"Wong",byTurn:3,toLineId:"LB"}},'+
    '{id:"LB",name:"B",turns:[[],[],["Hulk"],[],[],[]],adj:[0,0,0,0,0,0]}];'+
    'd.activeLineId="LA"; d.line=d.lines[0].turns; })()');
  const bo = w.eval('branchAssembleOdds(activeDeck(), activeLine(activeDeck()), getLines(activeDeck()))');
  assert(near(bo.p, 51/66) && near(bo.pivot, 0.5), 'R15: Plan B policy odds exact (51/66, pivot 50%)');
  // UI: full readout in the planner, compact on the showcase, both with the branch line
  w.eval('setTab("deck"); setDeckTab("planner"); renderPlanner();'); await sleep(20);
  const simP = d.querySelector('#planner .lp-sim');
  assert(simP!==null && /Consistency/.test(simP.textContent) && /%/.test(simP.textContent), 'R15: planner shows the consistency box');
  assert(/Plan B pivot/.test(simP.textContent) && /pivot in ~50%/.test(simP.textContent), 'R15: planner box includes branch-aware odds');
  w.eval('setDeckTab("overview"); renderLinePlan();'); await sleep(20);
  const simR = d.querySelector('#lineplan .lp-sim');
  assert(simR!==null && /Comes together as written in/.test(simR.textContent), 'R15: showcase read view carries the compact readout');
  // milestone split when the line spans early + late game
  w.eval('(function(){ const d=activeDeck(); mutateActiveLine(d, function(lo){ lo.turns=[[],["Wong"],[],[],["Hulk"],[]]; delete lo.branch; }); })(); renderLinePlan();'); await sleep(20);
  assert(/T1–3/.test(d.querySelector('#lineplan .lp-sim').textContent) && /full script/.test(d.querySelector('#lineplan .lp-sim').textContent),
    'R15: early/late lines split into T1–3 + full-script milestones');
  // not a full 12 -> no consistency claims
  w.eval('(function(){ const d=activeDeck(); d.cards=d.cards.slice(0,8); })(); renderPlanner(); renderLinePlan();'); await sleep(20);
  assert(d.querySelector('#planner .lp-sim')===null && d.querySelector('#lineplan .lp-sim')===null, 'R15: partial decks show no consistency box');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="r15";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(10);

  // ================= R17: the Build tab knows what you're building =================
  // Newest sort: later release first, undated cards sink, ties fall back to Energy order
  assert(w.eval('SORTS[1].k')==='new' && /Newest/.test(d.querySelector('#fw-sort [data-sort="new"]').textContent), 'R17: Newest sort chip exists');
  assert(w.eval('SORTS[1].fn({r:"2026-01-02",c:1,n:"A"},{r:"2026-06-01",c:1,n:"B"})')>0, 'R17: Newest fn puts the later release first');
  assert(w.eval('SORTS[1].fn({c:1,n:"A"},{r:"2022-05-07",c:5,n:"B"})')>0, 'R17: undated cards sink below any dated card');
  // NEW pill: a fresh release wears it, an old one doesn't
  w.eval('(function(){var c=S.db.find(x=>x.d==="Hulk"); c.r=new Date(Date.now()-5*86400000).toISOString().slice(0,10); renderCards();})()');
  assert(d.querySelector('#cardlist .tile[data-d="Hulk"] .newpill')!==null, 'R17: a card released this month wears the NEW pill');
  w.eval('(function(){var c=S.db.find(x=>x.d==="Hulk"); c.r="2022-10-18"; renderCards();})()');
  assert(d.querySelector('#cardlist .tile[data-d="Hulk"] .newpill')===null, 'R17: an old release shows no pill');
  w.eval('(function(){delete S.db.find(x=>x.d==="Hulk").r; renderCards();})()');
  // the insight curve is a cost filter
  w.eval('(function(){var dd=ensureDraft(); dd.cards=S.db.filter(c=>c.c===6).slice(0,3).map(c=>c.d); touch(dd); renderAll();})()');
  const preCount = d.getElementById('matchcount').textContent;
  d.querySelector('#ins-curve i[data-cost="6"]').click(); await sleep(30);
  assert(w.eval('S.filters.cost.has("6")'), 'R17: tapping a curve bar filters that cost');
  assert(d.getElementById('matchcount').textContent!==preCount, 'R17: the grid narrows to the tapped cost');
  assert(d.querySelector('#ins-curve i[data-cost="6"]').classList.contains('sel'), 'R17: the tapped bar wears its selected ring');
  d.querySelector('#ins-curve i[data-cost="6"]').click(); await sleep(30);
  assert(!w.eval('S.filters.cost.has("6")'), 'R17: tapping the bar again clears the filter');
  // Owned quick pill: one tap, persists as a preference, syncs with the flyout switch
  d.querySelector('#browsebar .bb-own[data-own="owned"]').click(); await sleep(30);
  assert(w.eval('S.filters.owned')==='owned' && w.eval('S.prefs.ownedMode.cards')==='owned', 'R17: Owned pill flips the filter and remembers it');
  assert(d.querySelector('#browsebar .bb-own[data-own="owned"]').classList.contains('on'), 'R17: the pill lights up');
  assert(d.querySelector('#fw-owned').classList.contains('on'), 'R17: the flyout switch agrees');
  d.querySelector('#browsebar .bb-own[data-own="owned"]').click(); await sleep(30);
  assert(w.eval('S.filters.owned')==='' && w.eval('S.prefs.ownedMode.cards')==='', 'R17: tapping again clears both');
  // the fit shelf: two discard enablers summon discard payoffs
  w.eval('(function(){var dd=activeDeck(); dd.cards=["Blade","Hellcow"]; touch(dd); renderAll();})()'); await sleep(20);
  assert(d.getElementById('fitshelf').hidden===false, 'R17: a two-card deck summons the fit shelf');
  const whys = [...d.querySelectorAll('#fitrow .fit-why')].map(e=>e.textContent);
  assert(whys.some(t=>/Discard payoff/.test(t)), 'R17: discard enablers surface discard payoffs');
  const firstFit = d.querySelector('#fitrow .fitcard');
  const fitId = firstFit.dataset.d;
  firstFit.click(); await sleep(30);
  assert(w.eval('activeDeck().cards.includes("'+fitId+'")'), 'R17: tapping a suggestion adds it to the deck');
  assert(d.querySelector('#fitrow .fitcard[data-d="'+fitId+'"]')===null, 'R17: the added card leaves the shelf');
  // creator-ledger evidence outranks and explains itself
  w.eval('window.__csFit = S.creatorStats; S.creatorStats = { updated:"x", windowDays:30, deckCount:40, cards:{}, pairs:{"AbsorbingMan|Blade":9}, ledger:[] };');
  w.eval('(function(){var dd=activeDeck(); dd.cards=["Blade","Hellcow"]; touch(dd); renderAll();})()'); await sleep(20);
  const amFit = [...d.querySelectorAll('#fitrow .fitcard')].find(f=>f.dataset.d==='AbsorbingMan');
  assert(!!amFit && /runs with Blade/.test(amFit.querySelector('.fit-why').textContent), 'R17: pair evidence suggests the card and names its partner');
  w.eval('S.creatorStats = window.__csFit;');
  // the shelf never dead-ends: at 12/12 it flips into swap ideas (R20), and a blank bench hides it
  w.eval('(function(){var dd=activeDeck(); dd.cards=S.db.slice(0,12).map(c=>c.d); touch(dd); renderAll();})()'); await sleep(20);
  assert(d.getElementById('fitshelf').hidden===false && /Swap ideas/.test(d.querySelector('#fitshelf .fit-head').textContent),
    'R17/R20: a full deck flips the shelf into swap ideas');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!==S.activeId;}); S.activeId=null; renderAll();'); await sleep(20);
  assert(d.getElementById('fitshelf').hidden===true, 'R17: a blank bench hides the shelf');
  // the pop: the newest addition lands with its animation class
  w.eval('(function(){var dd=ensureDraft(); dd.cards=["Blade"]; touch(dd); renderAll(); toggleCard("SwordMaster");})()'); await sleep(20);
  assert(d.querySelector('#dz .mini[data-d="SwordMaster"]').classList.contains('pop'), 'R17: the just-added card pops into the deck row');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!==S.activeId;}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(10);

  // ================= R18: the browse rail — sort/filter without the sheet =================
  assert(d.getElementById('browsebar')!==null && d.getElementById('browsebar').closest('#buildtop')!==null, 'R18: the rail rides the sticky build header');
  assert(d.querySelectorAll('#browsebar .bb-own').length===2, 'R18: Owned and Unowned pills live on the rail');
  assert(d.querySelectorAll('#browsebar .bbf[data-facet="cost"]').length===6 && d.querySelectorAll('#browsebar .bbf[data-facet="mech"]').length===5
    && d.querySelectorAll('#browsebar .bbf[data-facet="series"]').length===6, 'R18: cost, mechanic, and series chips all live on the rail');
  // one-tap filtering, live grid, flyout stays in agreement
  const preRail = d.getElementById('matchcount').textContent;
  d.querySelector('#browsebar .bbf[data-facet="cost"][data-v="3"]').click(); await sleep(30);
  assert(w.eval('S.filters.cost.has("3")'), 'R18: a rail chip filters in one tap');
  assert(d.getElementById('matchcount').textContent!==preRail, 'R18: the grid live-updates behind the rail');
  assert(d.querySelector('#browsebar .bbf[data-facet="cost"][data-v="3"]').classList.contains('on'), 'R18: the rail chip lights');
  assert(d.querySelector('#filterpanel [data-facet="cost"] .chip[data-v="3"]').classList.contains('on'), 'R18: the flyout chip agrees');
  assert(d.querySelector('#ins-curve i[data-cost="3"]').classList.contains('sel'), 'R18: the curve bar agrees too');
  d.querySelector('#browsebar .bbf[data-facet="cost"][data-v="3"]').click(); await sleep(30);
  assert(!w.eval('S.filters.cost.has("3")'), 'R18: tapping again clears it');
  // the sort button cycles in place
  const bbSort = d.querySelector('#browsebar .bb-sort'), bbLbl = () => d.querySelector('#browsebar .bb-sort-label').textContent;
  assert(bbLbl()==='Energy', 'R18: sort chip names the current sort');
  bbSort.click(); await sleep(30);
  assert(w.eval('S.sort')==='new' && bbLbl()==='Newest', 'R18: one tap cycles Energy -> Newest');
  bbSort.click(); await sleep(20);
  bbSort.click(); await sleep(20);
  bbSort.click(); await sleep(20);
  assert(w.eval('S.sort')==='cost' && bbLbl()==='Energy', 'R18: the cycle wraps back to Energy');
  // cost dividers: Energy order reads in rows, each divider is a tap-filter
  assert(d.querySelectorAll('#cardlist .costdiv').length>=6, 'R18: Energy order breaks the grid into cost rows');
  assert(d.querySelectorAll('#cardlist .tile').length===357, 'R18: dividers never change the tile count');
  const div3 = [...d.querySelectorAll('#cardlist .costdiv')].find(x=>x.dataset.cost==='3');
  div3.click(); await sleep(30);
  assert(w.eval('S.filters.cost.has("3")'), 'R18: tapping a cost divider filters to that cost');
  d.querySelector('#cardlist .costdiv[data-cost="3"]').click(); await sleep(30);
  assert(!w.eval('S.filters.cost.has("3")'), 'R18: tapping the divider again clears it');
  w.eval('S.sort="name"; renderBrowse();'); await sleep(20);
  assert(d.querySelectorAll('#cardlist .costdiv').length===0, 'R18: other sorts drop the dividers (they only mean something in Energy order)');
  w.eval('S.sort="cost"; renderBrowse();'); await sleep(20);

  // ================= R19: Library gets its own rail, unowned filter, independent banks =================
  assert(d.querySelectorAll('#coll-browsebar .bbf').length===17 && d.querySelectorAll('#coll-browsebar .bb-own').length===2,
    'R19: the Library wears its own full rail');
  // independence: a cost filter set on Build never follows you into the Library
  d.querySelector('#browsebar .bbf[data-facet="cost"][data-v="3"]').click(); await sleep(20);
  assert(w.eval('S.filters.cost.has("3")'), 'R19: Build takes a cost filter');
  w.eval('setTab("collection")'); await sleep(30);
  assert(w.eval('S.filters.cost.size')===0 && w.eval('S.filters.owned')==='', 'R19: the Library opens with its own clean filters');
  // the Library can show only what you are missing
  w.eval('S.owned = new Set(["Hulk"]); renderCollection();'); await sleep(20);
  d.querySelector('#coll-browsebar .bb-own[data-own="unowned"]').click(); await sleep(30);
  assert(w.eval('S.filters.owned')==='unowned', 'R19: the Unowned pill filters the Library');
  assert(d.querySelector('#colllist .tile[data-d="Hulk"]')===null && d.querySelectorAll('#colllist .tile').length>0,
    'R19: unowned view hides the cards you have and keeps the ones you want');
  assert(w.eval('S.prefs.ownedMode.collection')==='unowned', 'R19: the Library remembers its owned mode separately');
  d.querySelector('#coll-browsebar .bb-own[data-own="owned"]').click(); await sleep(30);
  assert(w.eval('S.filters.owned')==='owned' && [...d.querySelectorAll('#colllist .tile')].every(t=>t.dataset.d==='Hulk'),
    'R19: switching to Owned shows exactly the collection');
  d.querySelector('#coll-browsebar .bb-own[data-own="owned"]').click(); await sleep(20);
  // sort independence: Newest in the Library, Energy still on Build
  d.querySelector('#coll-browsebar .bb-sort').click(); await sleep(20);
  assert(w.eval('S.sort')==='new' && d.querySelector('#coll-browsebar .bb-sort-label').textContent==='Newest', 'R19: the Library cycles to Newest');
  w.eval('setTab("cards")'); await sleep(30);
  assert(w.eval('S.sort')==='cost' && w.eval('S.filters.cost.has("3")'), 'R19: back on Build — Energy sort and the cost filter are exactly as left');
  w.eval('setTab("collection")'); await sleep(30);
  assert(w.eval('S.sort')==='new', 'R19: and the Library still remembers Newest');
  // search text swaps with the bank too
  w.eval('S.filters.q = "wong"; renderBrowse();'); await sleep(20);
  w.eval('setTab("cards")'); await sleep(20);
  assert(d.getElementById('q').value==='', 'R19: Build search box is untouched by Library search');
  w.eval('setTab("collection")'); await sleep(20);
  assert(d.getElementById('q').value==='wong', 'R19: the Library search text is waiting where it was left');
  // tidy up both banks for anything downstream
  w.eval('clearAllFilters(); setSort("cost"); setTab("cards"); clearAllFilters(); setSort("cost");'); await sleep(20);

  // ================= R20: complete my deck + swap ideas (the Hearthstone move) =================
  // seed two discard cards + creator decks that vote for their real packages
  w.eval('window.__cd0 = { decks:S.creatorDecks, stats:S.creatorStats };'+
    'S.creatorDecks = ['+
    ' {creator:"A",video:"v1",url:"",published:"",name:"Discard A",ids:["Blade","Hellcow","Morbius","Swarm","MODOK","Colleen","WolverineZabu","Apocalypse","X23","Daken","DraculaCh","Proxima"].map(x=>x)},'+
    ' {creator:"B",video:"v2",url:"",published:"",name:"Discard B",ids:["Blade","Hellcow","Morbius","Swarm","MODOK","Apocalypse"]}'+
    '];');
  w.eval('(function(){var dd=ensureDraft(); dd.cards=["Blade","Hellcow"]; touch(dd); renderAll();})()'); await sleep(20);
  assert(d.getElementById('btn-complete').hidden===false, 'R20: a seeded deck offers Complete my deck');
  d.getElementById('btn-complete').click(); await sleep(40);
  assert(w.eval('activeDeck().cards.length')===12, 'R20: one tap fills the deck to 12');
  assert(w.eval('activeDeck().cards.includes("Morbius") && activeDeck().cards.includes("Swarm")'),
    'R20: the meta layer votes real packagemates in (Morbius + Swarm ride with Blade/Hellcow)');
  const filledOnce = w.eval('JSON.stringify(activeDeck().cards)');
  const curveOk = w.eval('(function(){var b=[0,0,0,0,0,0,0]; activeDeck().cards.forEach(id=>{var c=S.byId[id]; if(c) b[Math.min(c.c,6)]++;}); return Math.max.apply(null,b);})()');
  assert(curveOk<=5, 'R20: the curve conscience prevents a one-cost pileup (max bucket '+curveOk+')');
  assert(d.getElementById('btn-complete').hidden===true, 'R20: a full deck hides the button');
  // determinism: same seeds, same completion
  w.eval('(function(){var dd=activeDeck(); dd.cards=["Blade","Hellcow"]; touch(dd); renderAll();})()'); await sleep(20);
  d.getElementById('btn-complete').click(); await sleep(40);
  assert(w.eval('JSON.stringify(activeDeck().cards)')===filledOnce, 'R20: completion is deterministic — same seeds, same 12');
  // at 12/12 the shelf becomes swap ideas
  assert(d.getElementById('fitshelf').hidden===false && /Swap ideas/.test(d.querySelector('#fitshelf .fit-head').textContent),
    'R20: at 12/12 the shelf turns into swap ideas');
  const swapCand = d.querySelector('#fitrow .fitcard');
  assert(!!swapCand, 'R20: swap candidates are on offer');
  const swapId = swapCand.dataset.d;
  swapCand.click(); await sleep(30);
  assert(d.getElementById('modalwrap').classList.contains('on') && d.querySelectorAll('#modal .swapgrid .mini').length===12,
    'R20: tapping a swap idea opens the sheet with all 12 incumbents');
  const outId = d.querySelector('#modal .swapgrid .mini').dataset.d;
  d.querySelector('#modal .swapgrid .mini').click(); await sleep(30);
  assert(w.eval('activeDeck().cards.length')===12 && w.eval('activeDeck().cards.includes("'+swapId+'")') && !w.eval('activeDeck().cards.includes("'+outId+'")'),
    'R20: the swap lands — newcomer in, incumbent out, still 12');
  assert(!d.getElementById('modalwrap').classList.contains('on'), 'R20: the sheet closes on the swap');
  // Owned mode is a promise: completion draws only from the collection
  w.eval('(function(){var dd=activeDeck(); dd.cards=["Blade","Hellcow"]; touch(dd);'+
    ' S.owned=new Set(S.db.slice(0,40).map(c=>c.d).concat(["Blade","Hellcow"])); setOwnedFilter("owned"); renderAll();})()'); await sleep(20);
  d.getElementById('btn-complete').click(); await sleep(40);
  assert(w.eval('activeDeck().cards.every(id=>S.owned.has(id))'), 'R20: with Owned on, every fill comes from the collection');
  w.eval('setOwnedFilter(""); S.owned=new Set();'+
    'S.creatorDecks=window.__cd0.decks; S.creatorStats=window.__cd0.stats;'+
    'S.decks=S.decks.filter(function(x){return x.id!==S.activeId;}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(20);

  // ============ MY SYNERGIES: create via the picker modal, feed the fit engine, sync ============
  w.eval('S.mySyns=[]; setTab("ai");'); await sleep(20);
  assert(d.getElementById('mysyns')!==null && d.getElementById('btn-addsyn')!==null, 'MS: the Coach tab hosts the My-synergies section');
  d.getElementById('btn-addsyn').click(); await sleep(20);
  assert(d.getElementById('syn-q')!==null, 'MS: New synergy opens the picker modal');
  const _msType = async (txt) => { const q=d.getElementById('syn-q'); q.value=txt; q.dispatchEvent(new w.window.Event('input',{bubbles:true})); await sleep(20); };
  await _msType('wong');
  assert(d.querySelectorAll('#syn-matches .mini').length>0, 'MS: search surfaces matching cards');
  d.querySelector('#syn-matches .mini[data-d="Wong"]').click(); await sleep(20);
  await _msType('odin');
  d.querySelector('#syn-matches .mini[data-d="Odin"]').click(); await sleep(20);
  assert(d.querySelectorAll('#syn-sel .mini').length===2, 'MS: tapped cards land in the picked strip');
  d.getElementById('syn-note').value='Odin re-triggers Wong doubles';
  d.getElementById('syn-save').click(); await sleep(20);
  assert(w.eval('S.mySyns.length')===1 && w.eval('S.mySyns[0].ids.length')===2 && /Odin re-triggers/.test(w.eval('S.mySyns[0].note')), 'MS: Save records ids + note');
  assert(d.querySelectorAll('#mysyns .msyn-row').length===1, 'MS: the saved synergy renders as a row');
  // one-liner accordion: rows start collapsed (names + note on one line), tap opens, tap again closes
  assert(!d.querySelector('#mysyns .msyn-row').classList.contains('open'), 'MS: rows start collapsed');
  assert(/Wong · Odin/.test(d.querySelector('#mysyns .msyn-row .msyn-names').textContent), 'MS: the collapsed line names the linked cards');
  d.querySelector('#mysyns .msyn-row').click(); await sleep(20);
  assert(d.querySelector('#mysyns .msyn-row').classList.contains('open'), 'MS: tapping a row expands it');
  d.querySelector('#mysyns .msyn-row').click(); await sleep(20);
  assert(!d.querySelector('#mysyns .msyn-row').classList.contains('open'), 'MS: tapping again collapses it');
  assert(/\.msyn-row\.open \.msyn-body\{display:block/.test(html), 'MS: minis + Edit/Delete only show on the open row (CSS)');
  // search by card: the query narrows rows, a miss explains itself
  const _msQ = async (txt) => { const q=d.getElementById('msyn-q'); q.value=txt; q.dispatchEvent(new w.window.Event('input',{bubbles:true})); await sleep(20); };
  assert(!d.getElementById('msyn-qrow').hidden, 'MS: the search box shows once synergies exist');
  await _msQ('wong');
  assert(d.querySelectorAll('#mysyns .msyn-row').length===1, 'MS: searching a member card keeps the row');
  await _msQ('zabu');
  assert(d.querySelectorAll('#mysyns .msyn-row').length===0 && /No synergy uses/.test(d.getElementById('mysyns').textContent),
    'MS: a non-member search empties the list with a hint');
  await _msQ('');
  // two-card floor enforced
  d.getElementById('btn-addsyn').click(); await sleep(20);
  await _msType('hulk');
  d.querySelector('#syn-matches .mini[data-d="Hulk"]').click(); await sleep(20);
  d.getElementById('syn-save').click(); await sleep(20);
  assert(w.eval('S.mySyns.length')===1, 'MS: a one-card synergy refuses to save');
  d.getElementById('syn-cancel').click(); await sleep(10);
  // the fit engine suggests the missing member, flagged as YOUR combo
  w.eval('(function(){ var dd={id:"msfit",name:"",cards:["Wong","Hulk","AntMan"],updated:Date.now()}; S.decks.unshift(dd); S.activeId="msfit"; })(); renderAll();'); await sleep(20);
  const _msSugg = w.eval('fitSuggestions(20).map(s=>({d:s.c.d,why:s.why}))');
  const _msHit = _msSugg.find(s=>s.d==='Odin');
  assert(_msHit!==undefined && /your combo/.test(_msHit.why), 'MS: fitSuggestions offers Odin because of the declared combo ('+(_msHit?_msHit.why:'absent')+')');
  // synced like creators: rides the blob, unions by id
  assert(w.eval('buildStateBlob().mySyns.length')===1, 'MS: synergies ride the sync blob');
  const _msMerged = w.eval('mergeState(buildStateBlob(), {mySyns:[{id:"remoteSyn",ids:["Hulk","Odin"],note:""}]}).mySyns.length');
  assert(_msMerged===2, 'MS: merge unions local + remote synergies');
  // delete from the row
  w.eval('setTab("ai");'); await sleep(10);
  d.querySelector('#mysyns .msyn-row .abtn.danger').click(); await sleep(20);
  assert(w.eval('S.mySyns.length')===0 && d.querySelectorAll('#mysyns .msyn-row').length===0, 'MS: Delete removes the synergy');
  w.eval('S.decks=S.decks.filter(function(x){return x.id!=="msfit";}); S.activeId=null; renderAll(); setTab("cards");'); await sleep(20);

  assert(errors.length===0, 'R15: no runtime errors during the suite'+(errors.length?' -> '+errors.join(' | '):''));

  console.log('\nDONE. errors:', errors.length?errors:'none');
})();
