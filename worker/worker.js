// MVPoisk API cache proxy for Cloudflare Workers.
// Deploy this over the existing mvpoisk.cizikvpn.workers.dev Worker.
//
// Optional extra legitimate API keys can be added in Cloudflare as secrets:
// KINOPOISK_API_KEY, KINOPOISK_API_KEY_2, ... KINOPOISK_API_KEY_5
// They are used only as failover. Do not create extra accounts/tokens solely
// to bypass a provider's plan limits.

const UPSTREAM_ORIGIN = 'https://api.poiskkino.dev';
const BUILTIN_PRIMARY_KEY = 'MD2PV7Q-WPYM4Y8-GKQER3G-10WHNCP';
const MAX_ERROR_BODY = 5000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Expose-Headers': 'X-MVPoisk-Cache, X-MVPoisk-Upstream-Key',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extra,
    },
  });
}

function getKeys(env) {
  const configured = [
    env.KINOPOISK_API_KEY,
    env.KINOPOISK_API_KEY_2,
    env.KINOPOISK_API_KEY_3,
    env.KINOPOISK_API_KEY_4,
    env.KINOPOISK_API_KEY_5,
    BUILTIN_PRIMARY_KEY,
  ].filter(Boolean);
  return [...new Set(configured)];
}

function normalizeSearch(url) {
  const entries = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) => {
    const keyCompare = ak.localeCompare(bk);
    return keyCompare || String(av).localeCompare(String(bv));
  });
  const params = new URLSearchParams();
  for (const [key, value] of entries) params.append(key, value);
  return params.toString();
}

function cacheSeconds(pathname) {
  if (/\/movie\/\d+$/.test(pathname)) return 7 * 24 * 60 * 60; // movie page: 7d
  if (pathname.endsWith('/movie/search')) return 6 * 60 * 60;     // search: 6h
  if (pathname.endsWith('/movie')) return 12 * 60 * 60;          // catalog: 12h
  if (pathname.endsWith('/review')) return 12 * 60 * 60;         // reviews: 12h
  if (pathname.includes('/dictionary/')) return 7 * 24 * 60 * 60;
  return 6 * 60 * 60;
}

function shouldFailover(status) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

async function smallErrorText(response) {
  try {
    const text = await response.text();
    return text.slice(0, MAX_ERROR_BODY);
  } catch {
    return '';
  }
}

function withCacheHeaders(response, state, keyIndex = '') {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders())) headers.set(name, value);
  headers.set('X-MVPoisk-Cache', state);
  if (keyIndex !== '') headers.set('X-MVPoisk-Upstream-Key', String(keyIndex));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    const incoming = new URL(request.url);
    if (incoming.pathname === '/' || incoming.pathname === '/health') {
      return json({
        ok: true,
        service: 'MVPoisk API cache',
        upstream: 'poiskkino.dev',
        cache: 'Cloudflare Cache API',
        configuredKeys: getKeys(env).length,
      });
    }

    if (!incoming.pathname.startsWith('/api/')) {
      return json({ error: 'not_found', hint: 'Use /api/v1.4/...' }, 404);
    }

    const upstreamPath = incoming.pathname.replace(/^\/api/, '');
    if (!/^\/v1(?:\.\d+)?\//.test(upstreamPath)) {
      return json({ error: 'unsupported_api_path' }, 400);
    }

    const normalizedQuery = normalizeSearch(incoming);
    const cacheUrl = new URL(request.url);
    cacheUrl.search = normalizedQuery ? `?${normalizedQuery}` : '';
    const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
    const cache = caches.default;

    const cached = await cache.match(cacheRequest);
    if (cached) return withCacheHeaders(cached, 'HIT');

    const upstreamUrl = new URL(`${UPSTREAM_ORIGIN}${upstreamPath}`);
    upstreamUrl.search = normalizedQuery ? `?${normalizedQuery}` : '';
    const keys = getKeys(env);
    if (!keys.length) return json({ error: 'no_api_key_configured' }, 500);

    const errors = [];
    for (let index = 0; index < keys.length; index++) {
      let upstream;
      try {
        upstream = await fetch(upstreamUrl.toString(), {
          method: 'GET',
          headers: {
            'X-API-KEY': keys[index],
            'Accept': 'application/json',
            'User-Agent': 'MVPoisk/1.0 (+Cloudflare Worker)',
          },
        });
      } catch (error) {
        errors.push(`key ${index + 1}: network ${error?.message || 'error'}`);
        continue;
      }

      if (!upstream.ok) {
        const body = await smallErrorText(upstream.clone());
        errors.push(`key ${index + 1}: HTTP ${upstream.status}${body ? ` ${body}` : ''}`);
        if (shouldFailover(upstream.status) && index < keys.length - 1) continue;
        return json({ error: 'upstream_error', status: upstream.status, details: errors }, upstream.status || 502, {
          'X-MVPoisk-Cache': 'MISS',
        });
      }

      const ttl = cacheSeconds(upstreamPath);
      const headers = new Headers(upstream.headers);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
      headers.set('Cache-Control', `public, max-age=300, s-maxage=${ttl}, stale-while-revalidate=86400`);
      for (const [name, value] of Object.entries(corsHeaders())) headers.set(name, value);
      headers.set('X-MVPoisk-Cache', 'MISS');
      headers.set('X-MVPoisk-Upstream-Key', String(index + 1));

      const response = new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));
      return response;
    }

    return json({ error: 'no_upstream_available', details: errors }, 502, { 'X-MVPoisk-Cache': 'MISS' });
  },
};
