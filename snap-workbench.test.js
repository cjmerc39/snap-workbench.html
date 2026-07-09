const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://example.com/',
  beforeParse(w){ w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder; w.confirm=()=>true; w.scrollTo=()=>{};
    w.fetch = async () => ({ json: async () => ({ content:[{type:'text',text:'mock coach reply'}] }) }); },
});
dom.window.addEventListener('error', e => errors.push(e.message));
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(150);
  const assert = (c,m)=>{ if(!c){console.error('FAIL:',m); process.exitCode=1;} else console.log('ok  :',m); };

  assert(errors.length===0, 'no runtime errors on boot'+(errors.length?' -> '+errors.join(' | '):''));
  assert(d.querySelectorAll('#cardlist .tile').length===357, 'renders 357 tiles');

  // --- round-2 restyle: sorting (Energy default: cost asc -> power desc -> name) ---
  assert(w.eval('SORTS.length')===3, 'SORTS has exactly 3 entries');
  assert(w.eval('SORTS.map(s=>s.k).join()')==='cost,power,name', 'SORTS keys are [cost,power,name]');
  assert(w.eval('SORTS.every(s=>s.k!=="series")'), 'series removed from SORTS (stays a filter facet only)');
  assert(w.eval('SORTS[0].fn({c:1},{c:2})')<0, 'Energy fn: lower cost sorts first');
  assert(w.eval('SORTS[0].fn({c:2,p:3,n:"B"},{c:2,p:9,n:"A"})')>0, 'Energy fn: equal cost -> higher power first (power desc)');
  assert(w.eval('SORTS[0].fn({c:2,p:5,n:"B"},{c:2,p:5,n:"A"})')>0, 'Energy fn: equal cost+power -> name ascending');
  assert(/Energy/.test(d.querySelector('#fw-sort [data-sort="cost"]').textContent), 'cost sort chip is labelled "Energy"');
  const bootOrder = w.eval('(function(){var t=[].slice.call(document.querySelectorAll("#cardlist .tile")).map(function(e){return e.dataset.d;});'+
    'var cost=function(id){return getCard(id).c;},pow=function(id){return getCard(id).p;};var mono=true,tie=false;'+
    'for(var i=1;i<t.length;i++){if(cost(t[i-1])>cost(t[i]))mono=false;if(cost(t[i-1])===cost(t[i])&&pow(t[i-1])>=pow(t[i]))tie=true;}'+
    'return {mono:mono,firstLE:cost(t[0])<=cost(t[t.length-1]),tie:tie};})()');
  assert(bootOrder.mono && bootOrder.firstLE, 'boot grid renders in Energy order (cost non-decreasing)');
  assert(bootOrder.tie, 'Energy sort breaks equal-cost ties by power descending');

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
  assert(d.querySelector('#m-refresh')===null, 'one-click refresh hidden when REFRESH_URL empty');
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
  d.querySelector('#bh-collapse').click(); await sleep(20);
  assert(d.querySelector('#deckzone').classList.contains('closed'), 'zone collapses');
  d.querySelector('#bh-collapse').click(); await sleep(20);
  // in-deck collection tiles gray out (class present in compact mode)
  const someInDeck = w.eval('activeDeck().cards[0]');
  if(someInDeck) assert(d.querySelector('#cardlist .tile[data-d="'+someInDeck+'"]').classList.contains('indeck'), 'in-deck collection tile carries gray state');
  // filter panel: tap a cost chip in the always-in-DOM widget, badge updates, list narrows
  const allN = d.querySelectorAll('#cardlist .tile').length;
  d.querySelector('#fw-cost .chip[data-v="1"]').click(); await sleep(30);
  assert(d.querySelectorAll('#cardlist .tile').length < allN, 'cost filter narrows the grid');
  assert(d.querySelector('#fcount').textContent==='1', 'filter badge shows 1');
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

  // --- round-2 restyle: integrated deck sub-tabs ---
  w.eval('setTab("deck")'); await sleep(20);
  assert(d.querySelector('#decktabs')!==null, 'deck sub-tab bar (#decktabs) present');
  assert(d.querySelector('.dpane[data-pane="overview"]').classList.contains('on'), 'overview sub-tab active by default');
  d.querySelector('#decktabs [data-dtab="odds"]').click(); await sleep(20);
  assert(d.querySelector('.dpane[data-pane="odds"]').classList.contains('on') && !d.querySelector('.dpane[data-pane="notes"]').classList.contains('on'),
    'clicking Odds sub-tab shows odds pane and hides notes pane');
  assert(w.eval('S.deckTab')==='odds', 'S.deckTab tracks the active sub-tab');
  assert(d.querySelectorAll('#drawodds .odds-grid.single .oc').length===7, 'draw-odds singleton table still 7 turns after sub-tab switch');
  assert(d.querySelectorAll('#decklist .mini').length===12, 'deck minis (#decklist) still 12 after restructure');
  w.eval('setTab("cards")'); await sleep(10);
  assert(d.querySelectorAll('#dz .mini').length===12, 'build-zone minis (#dz) still 12 after restructure');


  // ============ WP2: analytics + import robustness ============
  // C1: draw / combo math (12-card singleton, hypergeometric)
  assert(w.eval('pBoth(5)') > 0.41 && w.eval('pBoth(5)') < 0.43, 'pBoth(5) in (.41,.43) -> '+w.eval('pBoth(5)').toFixed(3));
  assert(w.eval('pSingle(6)') === 0.75, 'pSingle(6) === .75');
  assert(w.eval('pEither(5)') > 0.9, 'pEither(5) > .9');

  // build a clean 12-card active deck for DOM-level analytics
  w.eval('(function(){ const ids=S.db.slice(0,12).map(c=>c.d); S.decks.unshift({id:"wp2",name:"WP2 Deck",cards:ids,updated:Date.now()}); S.activeId="wp2"; renderAll(); })()');
  await sleep(30);
  w.eval('setTab("deck")'); await sleep(20);

  // C1: combo-out shows a percentage after picking two cards; singleton table has 7 turns
  assert(d.querySelectorAll('#drawodds .odds-grid.single .oc').length===7, 'draw-odds singleton table shows 7 turns');
  const twoIds = w.eval('activeDeck().cards.slice(0,2)');
  const csa = d.querySelector('#combo-a'), csb = d.querySelector('#combo-b');
  csa.value = twoIds[0]; csa.dispatchEvent(new w.Event('change',{bubbles:true}));
  csb.value = twoIds[1]; csb.dispatchEvent(new w.Event('change',{bubbles:true}));
  await sleep(20);
  assert(d.querySelector('#combo-out').textContent.includes('%'), 'combo-out shows a percentage for two picked cards');

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
  assert(dr1 && dr1.status==='missing-enabler', 'destroy payoff with no enabler -> missing-enabler');
  const dwe = [payoffC, enablerC].concat(Array.from({length:10},()=>vanillaC));
  const dr2 = w.eval('deckSynergies('+JSON.stringify(dwe)+')').find(s=>s.key==='destroy');
  assert(dr2 && dr2.status==='active', 'destroy payoff + enabler -> active');

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


  // sticky build-top wraps zone + search
  const bt = d.querySelector('#buildtop');
  assert(bt && bt.querySelector('#dz') && bt.querySelector('#q') && bt.querySelector('#btn-filter'), 'sticky buildtop contains deck zone and search row');

  // --- v5 responsive / sticky offset ---
  assert(html.includes('@media (min-width:900px)'), 'desktop media query present');
  const stickTop = d.documentElement.style.getPropertyValue('--stick-top');
  assert(stickTop.endsWith('px'), 'sticky-offset var resolves to px ('+stickTop+')');

  // AI mocked
  w.eval('setTab("ai")'); d.querySelector('#btn-ask').click(); await sleep(80);
  assert(d.querySelector('#aiout').textContent.includes('mock coach reply'), 'AI flow works');

  console.log('\nDONE. errors:', errors.length?errors:'none');
})();
