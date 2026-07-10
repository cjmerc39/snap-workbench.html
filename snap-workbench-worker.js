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
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    if (path === '/coach' && request.method === 'POST') return coach(request, env, cors);
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

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
