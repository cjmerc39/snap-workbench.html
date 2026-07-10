/**
 * Snap Workbench worker: card feed proxy + AI coach proxy.
 *
 * Deploy (Cloudflare Workers, free tier):
 *   1. dash.cloudflare.com -> Workers & Pages -> Create Worker -> paste this file -> Deploy
 *   2. Worker -> Settings -> Variables -> add SECRET "ANTHROPIC_API_KEY" (only needed for /coach)
 *   3. Optional but recommended: add variable ALLOWED_ORIGIN = https://<you>.github.io
 *   4. In snap-workbench.html set:
 *        const REFRESH_URL = 'https://<your-worker>.workers.dev/cards'
 *        const COACH_URL   = 'https://<your-worker>.workers.dev/coach'
 *
 * GET  /cards -> slim card list (fetched server-side, variants stripped, edge-cached 1h)
 * POST /coach -> { prompt } in, { text } out (your API key stays server-side)
 * GET/PUT /sync -> tiny per-owner state store (KV). Needs a KV namespace bound as
 *          SYNC_KV and a secret SYNC_TOKEN. Bearer-token auth; single fixed key.
 * GET  /yt?url=... -> YouTube-only RSS proxy (handle/UC/channel-URL -> videos.xml),
 *          edge-cached 1h. Hard-restricted to youtube.com; no other host is fetchable.
 */

const UPSTREAM = 'https://marvelsnapzone.com/getinfo/?searchtype=cards&searchcardstype=true';
const SERIES = {
  'pool-1': '1', 'pool-2': '2', 'pool-3': '3', 'pool-4': '4', 'pool-5': '5',
  'starter-card': 'Base', 'recruit-season': 'Base',
};
const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    if (path === '/coach' && request.method === 'POST') return coach(request, env, cors);
    if (path === '/sync') return sync(request, env, cors);
    if (path === '/yt') return yt(request, env, ctx, cors);
    return cards(request, ctx, cors);
  },
};

async function cards(request, ctx, cors) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + '/cards');
  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
    return r;
  }
  let upstream;
  try {
    upstream = await fetch(UPSTREAM, { headers: { 'user-agent': 'snap-workbench (personal deck builder)' } });
  } catch (e) {
    return json({ error: 'upstream unreachable' }, 502, cors);
  }
  if (!upstream.ok) return json({ error: 'upstream returned ' + upstream.status }, 502, cors);

  const j = await upstream.json();
  const raw = (j && j.success && j.success.cards) || [];
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    if (c.status !== 'released' || c.type !== 'Character') continue;
    const name = strip(c.name);
    if (!c.carddefid || !name || /[<>!]/.test(c.carddefid) || seen.has(c.carddefid)) continue;
    seen.add(c.carddefid);
    const m = /pool-(\d)/.exec(c.source_slug || '');
    const card = {
      n: name, d: c.carddefid, c: +c.cost || 0, p: +c.power || 0,
      a: strip(c.ability), s: SERIES[c.source_slug] || (m ? m[1] : '?'),
    };
    if (!card.a && c.flavor) card.f = strip(c.flavor).replace(/^"|"$/g, '');
    if (c.art && /^https?:\/\//.test(c.art)) card.i = String(c.art);
    out.push(card);
  }
  out.sort((a, b) => (a.c - b.c) || a.n.localeCompare(b.n));

  const resp = json(out, 200, { ...cors, 'cache-control': 'public, max-age=3600', 'x-card-count': String(out.length) });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

async function coach(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY secret not set on the worker' }, 500, cors);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad request body' }, 400, cors); }
  const prompt = String(body && body.prompt || '').slice(0, 12000);
  if (!prompt) return json({ error: 'empty prompt' }, 400, cors);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: (data && data.error && data.error.message) || 'api error' }, 502, cors);
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return json({ text }, 200, cors);
}

/* ---- /sync : per-owner state store on KV (bearer-token gated) ---------------- */
// Constant-time-ish string compare so a wrong token can't be probed byte-by-byte.
function tsEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sync(request, env, cors) {
  if (!env.SYNC_TOKEN) return json({ error: 'SYNC_TOKEN secret not set' }, 500, cors);
  if (!env.SYNC_KV) return json({ error: 'SYNC_KV namespace not bound' }, 500, cors);
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !tsEqual(m[1], env.SYNC_TOKEN)) return json({ error: 'unauthorized' }, 401, cors);
  const KEY = 'state';               // single-owner app: one fixed blob, token is the only access control
  if (request.method === 'GET') {
    const v = await env.SYNC_KV.get(KEY);
    return new Response(v || '{}', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
    });
  }
  if (request.method === 'PUT') {
    const body = await request.text();
    if (body.length > 1048576) return json({ error: 'state too large (>1MB)' }, 413, cors);
    try { JSON.parse(body); } catch (e) { return json({ error: 'body is not JSON' }, 400, cors); }
    await env.SYNC_KV.put(KEY, body);
    return json({ ok: true }, 200, cors);
  }
  return json({ error: 'method not allowed' }, 405, cors);
}

/* ---- /yt : strict YouTube-only RSS proxy (handle/UC/channel URL -> videos.xml) --- */
async function yt(request, env, ctx, cors) {
  const p = new URL(request.url).searchParams.get('url') || '';
  const uc = await resolveChannelId(p);
  if (!uc) return json({ error: 'not a resolvable YouTube channel URL/handle/UC id' }, 400, cors);
  const feed = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + uc;
  const cache = caches.default;
  const cacheKey = new Request('https://yt.proxy/' + uc);   // own cache key, distinct from /cards
  let hit = await cache.match(cacheKey);
  if (!hit) {
    let up;
    try { up = await fetch(feed, { headers: { 'user-agent': 'snap-workbench (personal deck builder)' } }); }
    catch (e) { return json({ error: 'feed unreachable' }, 502, cors); }
    if (!up.ok) return json({ error: 'feed returned ' + up.status }, 502, cors);
    const xml = await up.text();
    hit = new Response(xml, {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
    ctx.waitUntil(cache.put(cacheKey, hit.clone()));
  }
  const r = new Response(hit.body, hit);
  Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}
// Resolve any accepted input to a UC channel id. ONLY ever fetches youtube.com.
async function resolveChannelId(input) {
  input = String(input || '').trim();
  let m = input.match(/(UC[0-9A-Za-z_-]{22})/);              // direct UC id or /channel/UC...
  if (m) return m[1];
  let pageUrl = null;                                        // else resolve @handle / /c/ / /user/ via the channel page
  if (/^@[\w.\-]+$/.test(input)) pageUrl = 'https://www.youtube.com/' + input;
  else {
    try {
      const u = new URL(input);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
      if (/^\/(@[\w.\-]+|c\/[\w.\-]+|user\/[\w.\-]+)/.test(u.pathname)) pageUrl = 'https://www.youtube.com' + u.pathname;
    } catch (e) { return null; }
  }
  if (!pageUrl) return null;
  let page;
  try { page = await fetch(pageUrl, { headers: { 'user-agent': 'Mozilla/5.0 snap-workbench' } }); }
  catch (e) { return null; }
  if (!page.ok) return null;
  const html = await page.text();
  // Prefer the canonical/externalId (the page's OWN channel) — the first raw "channelId" in the
  // page JSON can belong to a featured/related channel (e.g. @RegisKillbin lists his game-dev
  // channel first, which mis-resolved the handle to the wrong channel entirely).
  const c = html.match(/rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})"/)
    || html.match(/"externalId":"(UC[0-9A-Za-z_-]{22})"/)
    || html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/)
    || html.match(/channel\/(UC[0-9A-Za-z_-]{22})/);
  return c ? c[1] : null;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
