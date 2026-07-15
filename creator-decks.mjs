// Snap Workbench: harvest creator deck codes from YouTube channel RSS feeds.
// Zero-dep, native fetch. Mirrors update-cards.mjs conventions (backtick strings,
// UA header, per-source guards, never-clobber-to-empty, console reporting).
//
// Output contract (creator-decks.json):
//   { updated:"YYYY-MM-DD", decks:[ { creator, video, url, published, name, ids[, untapped][, zone] } ] }
//   - url        = the YouTube video URL (always present, the "Watch" link-out)
//   - ids        = decoded CardDefIds (empty when the source was an undecodable untapped slug
//                  or a bot-walled marvelsnapzone community page)
//   - untapped   = the untapped.gg deck URL, present whenever the source was a slug (link-out when ids empty)
//   - zone       = the marvelsnapzone.com URL, present whenever the source was one of theirs:
//                  deck-builder/?deck=<base64> decodes fully; community /decks/<slug>/ pages sit
//                  behind Cloudflare (no code in the URL), so those stay link-out only
//   - fan        = the snap.fan deck URL; the page is Cloudflare-walled but snap.fan's public
//                  API (/api/decks/<id>/) is open, so resolveFanDecks() fills the ids after
//                  harvest (falls back to link-out when the API call fails)
//
// Modes:
//   node creator-decks.mjs              fetch + merge/age-out + write
//   node creator-decks.mjs --dry        fetch + print JSON, no write
//   node creator-decks.mjs --selfcheck  no network; unit-check the decoders against the bundled cards.json
const fs = (await import(`node:fs`)).default;

const CHANNELS = [
  { creator:`Alexander Coccia`, id:`UCoJqslowQxACrT3msrmKJLg` },
  { creator:`Coougarrr`,        id:`UCdSQcEM6O1Hq09aWeDWbkPA` },
  { creator:`Unfitparrot`,      id:`UCvMrTBgyL5B51F_iT0iPq2w` },
];
const UA = { headers: { [`user-agent`]: `snap-workbench github action (personal deck builder)` } };
const OUT = `creator-decks.json`;
const CAP = 30;          // keep at most this many decks
const AGE_DAYS = 14;     // only keep decks from videos published within this window (owner: two weeks)
const DAY = 86400000;

// ---- card table: same reverse-map algorithm as the app's indexDb(), so app + harvester agree ----
function loadCards(){
  const j = JSON.parse(fs.readFileSync(`cards.json`, `utf8`));
  const cards = Array.isArray(j) ? j : (j.cards || []);
  const KNOWN = new Set(cards.map(c => c.d));
  const SHORT = {}, SKEL = {};                       // null value = collision (skip)
  const skel = d => d.replace(/[aeiouy]/g, ``);   // lowercase only: untapped keeps word-initial capitals (Armor->Armr, MotherAskani->MthrAskn)
  for(const c of cards){
    const k = skel(c.d) + c.d.length.toString(16).toUpperCase();
    SHORT[k] = (k in SHORT) ? null : c.d;
    const sk = skel(c.d);
    SKEL[sk] = (sk in SKEL) ? null : c.d;
  }
  return { KNOWN, SHORT, SKEL, count: cards.length };
}

// ---- decoders (mirror index.html parseCode's two untapped strategies + the legacy long format) ----
function makeDecoders({ KNOWN, SHORT, SKEL }){
  const resolveShort = tok => {
    if(SHORT[tok]) return SHORT[tok];                // exact compressed token
    const sk = tok.replace(/[0-9A-Fa-f]+$/, ``);     // fuzzy: drop trailing hex-length run, match skeleton
    return (sk && SKEL[sk]) ? SKEL[sk] : null;
  };
  const parseShortList = str => {                    // compressed comma-list of skeleton tokens
    if(typeof str !== `string` || !/^[A-Za-z0-9]+(?:,[A-Za-z0-9]+)+$/.test(str)) return null;
    const toks = str.split(`,`);
    const res = toks.map(resolveShort);
    if(!(toks.length >= 4 && res.filter(Boolean).length * 2 > toks.length)) return null;
    return { name:``, ids: toks.map((t, i) => res[i] || t).slice(0, 12) };
  };
  const safeDec = v => { try{ return decodeURIComponent(v); }catch(e){ return v; } };
  const parseSlug = slugRaw => {                      // untapped.gg /decks/ URL slug
    if(typeof slugRaw !== `string` || !slugRaw) return null;
    let slug = slugRaw.replace(/[?&]utm_[a-z_]+=[^&\s]*/gi, ``).replace(/\?.*$/, ``);
    const u = slug.indexOf(`_`);
    const name = u >= 0 ? safeDec(slug.slice(u + 1)) : ``;
    const cardPart = u >= 0 ? slug.slice(0, u) : slug;
    const ids = cardPart.split(`-`).filter(Boolean);
    if(ids.length < 6) return null;
    if(!(ids.filter(id => KNOWN.has(id)).length * 2 > ids.length)) return null;
    return { name, ids: ids.slice(0, 12) };
  };
  const b64 = c => { try{ let t = c.replace(/-/g, `+`).replace(/_/g, `/`).replace(/=+$/, ``); while(t.length % 4) t += `=`; return Buffer.from(t, `base64`).toString(`utf8`); }catch(e){ return ``; } };
  const parseLong = str => {                          // {Cards:[{CardDefId}]} JSON (raw or base64), the classic Snap code
    let obj = null;
    try{ obj = JSON.parse(str); }catch(e){ try{ obj = JSON.parse(b64(str)); }catch(e2){ obj = null; } }
    const list = obj && (obj.Cards || obj.cards);
    if(!Array.isArray(list) || !list.length) return null;
    const ids = list.map(x => x && (x.CardDefId || x.cardDefId || x.carddefid)).filter(Boolean);
    return ids.length ? { name: obj.Name || obj.name || ``, ids: ids.slice(0, 12) } : null;
  };
  return { parseShortList, parseSlug, parseLong, b64, safeDec };
}

// ---- pull every deck out of one video description ----
function extractDecks(desc, D){
  const out = [];
  const seen = new Set();
  // 1) untapped.gg deck links (NOT /profile/ — the /decks/ path prefix excludes those)
  const slugRe = /https?:\/\/snap\.untapped\.gg\/[a-z]{2}\/decks\/([^\s"'<>]+)/gi;
  let m;
  while((m = slugRe.exec(desc)) !== null){
    const url = m[0], slug = m[1];
    if(seen.has(url)) continue; seen.add(url);
    const r = D.parseSlug(slug);
    out.push({ name: r ? r.name : ``, ids: r ? r.ids : [], untapped: url });  // ids:[] => link-out only
  }
  // 1b) marvelsnapzone deck-builder links carry the whole deck as ?deck=<base64 {Cards} JSON>
  const zbRe = /https?:\/\/marvelsnapzone\.com\/deck-builder\/\?deck=([^\s"'<>&]+)/gi;
  while((m = zbRe.exec(desc)) !== null){
    const url = m[0];
    if(seen.has(url)) continue; seen.add(url);
    const r = D.parseLong(D.safeDec(m[1]));
    out.push({ name: r ? r.name : ``, ids: (r && r.ids) || [], zone: url });
  }
  // 1c) marvelsnapzone community deck pages are Cloudflare-walled and carry no code
  //     in the URL, so they harvest as link-out-only entries (mirrors undecodable slugs)
  const zpRe = /https?:\/\/marvelsnapzone\.com\/decks\/[^\s"'<>?#]+/gi;
  while((m = zpRe.exec(desc)) !== null){
    const url = m[0];
    if(seen.has(url)) continue; seen.add(url);
    out.push({ name: ``, ids: [], zone: url });
  }
  // 1d) snap.fan deck pages: collect the numeric id here; resolveFanDecks() fetches the
  //     cards from snap.fan's open API after extraction (the page itself is bot-walled)
  const fanRe = /https?:\/\/snap\.fan\/decks\/(\d+)\/?/gi;
  while((m = fanRe.exec(desc)) !== null){
    const url = m[0], id = m[1];
    if(seen.has(`fan:` + id)) continue; seen.add(`fan:` + id);
    out.push({ name: ``, ids: [], fan: url, fanId: id });
  }
  // 2) standalone base64 codes on their own line (compressed comma-list OR classic {Cards} JSON)
  const codeRe = /^[A-Za-z0-9+/]{16,}={0,2}$/gm;
  let cm;
  while((cm = codeRe.exec(desc)) !== null){
    const code = cm[0];
    const r = D.parseShortList(D.b64(code)) || D.parseLong(code);
    if(r && r.ids.length) out.push({ name: r.name, ids: r.ids, untapped: `` });
  }
  return out;
}

const unesc = s => String(s || ``)
  .replace(/&lt;/g, `<`).replace(/&gt;/g, `>`).replace(/&quot;/g, `"`)
  .replace(/&#39;/g, `'`).replace(/&apos;/g, `'`).replace(/&amp;/g, `&`);   // &amp; last so &amp;utm_ -> &utm_

async function fetchChannel(ch, D){
  try{
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=` + ch.id, UA);
    if(!r.ok){ console.error(`  ${ch.creator}: feed HTTP ${r.status}`); return { ok:false, decks:[] }; }
    const xml = await r.text();                       // RAW bytes only — a summarized fetch corrupts base64 with U+200C
    const entries = xml.split(`<entry>`).slice(1);
    const decks = [];
    for(const e of entries){
      const title = unesc((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ``).trim();
      const url = unesc((e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1] || ``);
      const published = ((e.match(/<published>([^<]+)<\/published>/) || [])[1] || ``).slice(0, 10);
      const desc = unesc((e.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/) || [])[1] || ``);
      for(const dk of extractDecks(desc, D)){
        const entry = { creator: ch.creator, video: title, url, published, name: dk.name || ``, ids: dk.ids || [] };
        if(dk.untapped) entry.untapped = dk.untapped;
        if(dk.zone) entry.zone = dk.zone;
        if(dk.fan){ entry.fan = dk.fan; entry.fanId = dk.fanId; }
        decks.push(entry);
      }
    }
    console.log(`  ${ch.creator}: ${entries.length} videos -> ${decks.length} deck(s)`);
    return { ok:true, decks };
  }catch(err){
    console.error(`  ${ch.creator}: fetch failed - ${err && err.message}`);
    return { ok:false, decks:[] };
  }
}

const dedupKey = x => (x.ids && x.ids.length) ? x.ids.slice().sort().join(`,`) : (x.untapped || x.zone || x.fan || x.url || ``);

// ---- snap.fan resolver: the deck page is Cloudflare-walled, the JSON API is not ----
// Per-deck guarded and bounded; a failed call just leaves that entry as a link-out.
async function resolveFanDecks(decks, KNOWN){
  const fanIdOf = x => x.fanId || ((x.fan || ``).match(/\/decks\/(\d+)/) || [])[1];
  const targets = decks.filter(x => x && fanIdOf(x) && !(x.ids && x.ids.length)).slice(0, 20);
  for(const x of targets){
    x.fanId = fanIdOf(x);
    try{
      const r = await fetch(`https://snap.fan/api/decks/` + x.fanId + `/`, UA);
      if(!r.ok){ console.error(`  snap.fan ${x.fanId}: HTTP ${r.status}`); continue; }
      const j = await r.json();
      const cards = (j && j.data && Array.isArray(j.data.cards)) ? j.data.cards : [];
      const ids = cards.map(c => c && c.cardDefKey).filter(Boolean);
      if(ids.length >= 6 && ids.filter(id => KNOWN.has(id)).length * 2 > ids.length){
        x.ids = ids.slice(0, 12);
        if(!x.name && j.data.title) x.name = String(j.data.title);
      }
    }catch(err){ console.error(`  snap.fan ${x.fanId}: ${err && err.message}`); }
  }
}

function selfcheck(){
  const table = loadCards();
  const D = makeDecoders(table);
  let ok = true;
  const check = (cond, msg) => { console.log((cond ? `ok  : ` : `FAIL: `) + msg); if(!cond) ok = false; };

  // owner's real untapped compressed payload
  const PAYLOAD = `TmNobHNTY3J0Y2hGLFNwZHJNbkJybmROd0QxNCxDbDQsTXJsbjYsTXJ2bEI5LFByd2xyNyxCc2hwNixWbnM1LFdiU2xuZzgsVGhDbGxjdHJDLFdyd2xmQk5naHRGLFNzcXRjaDk=`;
  const r = D.parseShortList(D.b64(PAYLOAD));
  check(!!r, `owner payload decodes to a deck`);
  if(r){
    check(r.ids.length === 12, `owner payload -> 12 tokens (got ${r.ids.length})`);
    check(r.ids[0] === `NicholasScratch`, `first token resolves to NicholasScratch (got ${r.ids[0]})`);
    check(r.ids[11] === `Sasquatch`, `last token resolves to Sasquatch (got ${r.ids[11]})`);
    const real = r.ids.filter(id => table.KNOWN.has(id)).length;
    check(real * 2 > 12, `strict majority resolve to real cards (${real}/12)`);
  }
  // slug decoder: clean UTM
  const sr = D.parseSlug(`Hulk-AntMan-Wong-Odin-Ironheart-Klaw-Cyclops-Sentinel-Hawkeye-Nightcrawler-Angela-Wasp_MyDeck?utm_medium=affiliate`);
  check(!!sr && sr.name === `MyDeck` && sr.ids[0] === `Hulk` && sr.ids.length === 12, `slug decoder: 12 ids + name`);
  // slug decoder: malformed missing-? UTM + hyphenated deck name
  const sr2 = D.parseSlug(`Hulk-AntMan-Wong-Odin-Ironheart-Klaw_Sub-Mariner&utm_campaign=x`);
  check(!!sr2 && sr2.name === `Sub-Mariner`, `slug decoder: malformed utm + hyphen name (got ${sr2 ? sr2.name : `null`})`);
  // marvelsnapzone: deck-builder links decode fully; community pages become link-outs
  const zCode = Buffer.from(JSON.stringify({ Name:`Zone Deck`, Cards:[{CardDefId:`Hulk`},{CardDefId:`AntMan`},{CardDefId:`Wong`},{CardDefId:`Odin`}] })).toString(`base64`);
  const zDesc = `Deck: https://marvelsnapzone.com/deck-builder/?deck=${encodeURIComponent(zCode)}\n` +
    `Page: https://marvelsnapzone.com/decks/toxicsoulking32c870a/ enjoy`;
  const ex = extractDecks(zDesc, D);
  check(ex.length === 2, `zone description yields 2 entries (got ${ex.length})`);
  const zb = ex.find(x => x.ids && x.ids.length), zp = ex.find(x => !(x.ids && x.ids.length));
  check(!!zb && zb.name === `Zone Deck` && zb.ids[0] === `Hulk` && zb.ids.length === 4 && /deck-builder/.test(zb.zone),
    `deck-builder link decodes name + ids + keeps the zone url`);
  check(!!zp && zp.zone === `https://marvelsnapzone.com/decks/toxicsoulking32c870a/`,
    `community deck page becomes a link-out entry (got ${zp ? zp.zone : `none`})`);
  check(dedupKey(zp) === zp.zone, `link-out zone entries dedupe on their zone url`);
  // snap.fan: extraction collects the id for the API resolver; duplicate ids collapse
  const fx = extractDecks(`a https://snap.fan/decks/355403/ b https://snap.fan/decks/355403 c https://snap.fan/decks/9/`, D);
  check(fx.length === 2 && fx[0].fanId === `355403` && fx[1].fanId === `9`, `snap.fan links extract ids + dedupe (got ${fx.length})`);
  check(fx[0].fan === `https://snap.fan/decks/355403/` && !fx[0].ids.length, `snap.fan entry starts as a link-out for the resolver`);

  console.log(ok ? `\nselfcheck OK (cards.json: ${table.count} cards)` : `\nselfcheck FAILED`);
  process.exit(ok ? 0 : 1);
}

async function main(){
  const args = process.argv.slice(2);
  if(args.includes(`--selfcheck`)) return selfcheck();

  const table = loadCards();
  const D = makeDecoders(table);
  console.log(`harvesting ${CHANNELS.length} channels (card table: ${table.count} cards)...`);

  let anyOk = false;
  let fresh = [];
  for(const ch of CHANNELS){
    const { ok, decks } = await fetchChannel(ch, D);
    if(ok) anyOk = true;
    fresh = fresh.concat(decks);
  }
  await resolveFanDecks(fresh, table.KNOWN);            // fill snap.fan link-outs via their open API
  fresh.forEach(x => { if(x) delete x.fanId; });        // working field only — never written to the JSON

  // merge with previous, aging out entries older than AGE_DAYS
  const nowMs = Date.now();
  let prev = [];
  try{
    const pj = JSON.parse(fs.readFileSync(OUT, `utf8`));
    prev = Array.isArray(pj) ? pj : (pj.decks || []);
  }catch(e){ /* first run */ }
  const keepPrev = prev.filter(x => x && x.published && (nowMs - Date.parse(x.published)) < AGE_DAYS * DAY);

  const map = new Map();
  for(const x of fresh.concat(keepPrev)){            // fresh first so a re-harvested deck wins the slot
    if(!x || !x.published || (nowMs - Date.parse(x.published)) >= AGE_DAYS * DAY) continue;
    const k = dedupKey(x);
    if(k && !map.has(k)) map.set(k, x);
  }
  const merged = [...map.values()]
    .sort((a, b) => (b.published || ``).localeCompare(a.published || ``))
    .slice(0, CAP);
  // R10.2: heal fossil ids in kept entries (tokens decoded before a decoder fix, preserved by the merge)
  const healIds = arr => (arr || []).map(id => table.KNOWN.has(id) ? id : (table.SHORT[id] || id));
  merged.forEach(x => { if(x.ids && x.ids.length) x.ids = healIds(x.ids); });
  const today = new Date().toISOString().slice(0, 10);

  console.log(`fresh: ${fresh.length} | kept-from-prev (<${AGE_DAYS}d): ${keepPrev.length} | merged+deduped+capped: ${merged.length}`);
  const decodable = merged.filter(x => x.ids && x.ids.length).length;
  console.log(`  decodable decks (Save-a-copy): ${decodable} | link-out only (undecodable slug): ${merged.length - decodable}`);

  if(args.includes(`--dry`)){
    console.log(JSON.stringify({ updated: today, decks: merged }, null, 2));
    return;
  }
  if(!anyOk){                                        // never clobber a good file to empty on a total-network failure
    console.error(`all channel fetches failed — leaving ${OUT} untouched`);
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify({ updated: today, decks: merged }, null, 2));
  console.log(`wrote ${merged.length} creator decks to ${OUT}`);

  // ---- R9: rolling 30-day stats ledger (separate file so the 14-day display window stays tight) ----
  // Ledger keeps every decodable harvested deck for STATS_DAYS, then emits per-card play counts and
  // pair counts (pairs seen >= 2 only, to keep the file small). Additive contract; app degrades gracefully.
  const STATS_DAYS = 30, SOUT = `creator-stats.json`;
  let ledger = [];
  try{ ledger = (JSON.parse(fs.readFileSync(SOUT, `utf8`)).ledger) || []; }catch(e){ /* first run */ }
  const lmap = new Map();
  for(const x of fresh.filter(x => x.ids && x.ids.length).concat(ledger)){
    if(!x || !x.published || (nowMs - Date.parse(x.published)) >= STATS_DAYS * DAY) continue;
    const k = dedupKey(x);
    if(k && !lmap.has(k)) lmap.set(k, { creator: x.creator, published: x.published, ids: healIds(x.ids) });
  }
  const led = [...lmap.values()];
  const cardN = {}, pairN = {};
  for(const dk of led){
    const ids = [...new Set(dk.ids)];
    ids.forEach(id => { cardN[id] = (cardN[id] || 0) + 1; });
    for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
      const key = [ids[i], ids[j]].sort().join(`|`);
      pairN[key] = (pairN[key] || 0) + 1;
    }
  }
  for(const k in pairN) if(pairN[k] < 2) delete pairN[k];
  fs.writeFileSync(SOUT, JSON.stringify({ updated: today, windowDays: STATS_DAYS, deckCount: led.length, ledger: led, cards: cardN, pairs: pairN }, null, 1));
  console.log(`wrote stats ledger: ${led.length} decks / ${Object.keys(cardN).length} cards / ${Object.keys(pairN).length} pairs (>=2) to ${SOUT}`);
}

main();
