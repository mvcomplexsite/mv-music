const AUDIUS_BASE = 'https://api.audius.co/v1'
const JAMENDO_BASE = 'https://api.jamendo.com/v3.0'
const JAMENDO_TEST_CLIENT_ID = '709fa152'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function providerOrder(env) {
  return safeText(env.MUSIC_PROVIDERS, 'audius,jamendo')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function audiusApiKey(env) {
  return safeText(env.AUDIUS_API_KEY).trim()
}

function audiusBearer(env) {
  return safeText(env.AUDIUS_BEARER_TOKEN).trim()
}

function jamendoClientId(env) {
  return safeText(env.JAMENDO_CLIENT_ID, JAMENDO_TEST_CLIENT_ID).trim() || JAMENDO_TEST_CLIENT_ID
}

function normalizeAudius(track) {
  if (!track) return null
  const art = track.artwork || track.user?.profile_picture || {}
  const artwork = art['480x480'] || art._480x480 || art['1000x1000'] || art._1000x1000 || art['150x150'] || art._150x150 || ''

  return {
    id: `audius:${track.id}`,
    provider: 'audius',
    providerId: String(track.id || ''),
    title: safeText(track.title, 'Без названия'),
    artist: safeText(track.user?.name || track.user?.handle, 'Неизвестный артист'),
    artistId: String(track.user?.id || ''),
    album: '',
    artwork,
    duration: asNumber(track.duration),
    genre: safeText(track.genre),
    plays: asNumber(track.play_count ?? track.playCount),
    streamable: track.is_streamable !== false && track.isStreamable !== false,
    sourceUrl: safeText(track.permalink),
    releaseDate: safeText(track.release_date ?? track.releaseDate)
  }
}

function normalizeJamendo(track) {
  if (!track) return null

  return {
    id: `jamendo:${track.id}`,
    provider: 'jamendo',
    providerId: String(track.id || ''),
    title: safeText(track.name, 'Без названия'),
    artist: safeText(track.artist_name, 'Неизвестный артист'),
    artistId: String(track.artist_id || ''),
    album: safeText(track.album_name),
    artwork: safeText(track.image || track.album_image),
    duration: asNumber(track.duration),
    genre: safeText(track.musicinfo?.tags?.genres?.[0] || ''),
    plays: asNumber(track.stats?.listening_total),
    streamable: Boolean(track.audio),
    streamUrl: safeText(track.audio),
    sourceUrl: safeText(track.shareurl || track.shorturl),
    releaseDate: safeText(track.releasedate)
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init)
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Upstream returned non-JSON content.
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}${data?.message ? `: ${data.message}` : ''}`)
  }

  return data
}

function audiusHeaders(env) {
  const headers = { accept: 'application/json' }
  const bearer = audiusBearer(env)
  if (bearer) headers.authorization = `Bearer ${bearer}`
  return headers
}

function addAudiusKey(url, env) {
  const key = audiusApiKey(env)
  if (key) url.searchParams.set('api_key', key)
  return url
}

async function audiusSearch(env, query, limit = 20) {
  if (!audiusBearer(env) && !audiusApiKey(env)) return []

  const url = addAudiusKey(new URL(`${AUDIUS_BASE}/tracks/search`), env)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(Math.min(limit, 50)))

  const data = await fetchJson(url, { headers: audiusHeaders(env) })
  return (data?.data || []).map(normalizeAudius).filter(Boolean)
}

async function audiusTrending(env, limit = 20) {
  if (!audiusBearer(env) && !audiusApiKey(env)) return []

  const url = addAudiusKey(new URL(`${AUDIUS_BASE}/tracks/trending`), env)
  url.searchParams.set('limit', String(Math.min(limit, 50)))
  url.searchParams.set('time', 'week')

  const data = await fetchJson(url, { headers: audiusHeaders(env) })
  return (data?.data || []).map(normalizeAudius).filter(Boolean)
}

async function audiusTrack(env, id) {
  if (!audiusBearer(env) && !audiusApiKey(env)) return null

  const url = addAudiusKey(new URL(`${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}`), env)
  const data = await fetchJson(url, { headers: audiusHeaders(env) })
  return normalizeAudius(data?.data)
}

function audiusStreamUrl(env, id) {
  return addAudiusKey(new URL(`${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}/stream`), env).toString()
}

async function jamendoTracks(env, params = {}) {
  const url = new URL(`${JAMENDO_BASE}/tracks/`)
  url.searchParams.set('client_id', jamendoClientId(env))
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', String(Math.min(Number(params.limit || 20), 50)))
  url.searchParams.set('imagesize', '500')
  url.searchParams.set('audioformat', 'mp32')
  url.searchParams.set('type', 'single albumtrack')
  url.searchParams.set('include', 'musicinfo stats')

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && key !== 'limit') {
      url.searchParams.set(key, String(value))
    }
  }

  const data = await fetchJson(url)
  if (data?.headers?.status && data.headers.status !== 'success') {
    throw new Error(data.headers.error_message || 'Jamendo API error')
  }

  return (data?.results || []).map(normalizeJamendo).filter(Boolean)
}

async function jamendoSearch(env, query, limit = 20) {
  return jamendoTracks(env, { search: query, limit })
}

async function jamendoTrending(env, limit = 20) {
  return jamendoTracks(env, {
    featured: '1',
    order: 'popularity_week',
    groupby: 'artist_id',
    limit
  })
}

async function jamendoTrack(env, id) {
  const tracks = await jamendoTracks(env, { id, limit: 1 })
  return tracks[0] || null
}

async function settleProviders(env, kind, ...args) {
  const calls = providerOrder(env).map(async (provider) => {
    try {
      if (provider === 'audius') {
        const fn = kind === 'search' ? audiusSearch : kind === 'trending' ? audiusTrending : null
        return fn ? await fn(env, ...args) : []
      }

      if (provider === 'jamendo') {
        const fn = kind === 'search' ? jamendoSearch : kind === 'trending' ? jamendoTrending : null
        return fn ? await fn(env, ...args) : []
      }

      return []
    } catch (error) {
      console.warn(`[provider:${provider}] ${kind} failed:`, error?.message || error)
      return []
    }
  })

  const resultSets = await Promise.all(calls)
  const max = Math.max(0, ...resultSets.map((items) => items.length))
  const interleaved = []

  for (let index = 0; index < max; index += 1) {
    for (const items of resultSets) {
      if (items[index]) interleaved.push(items[index])
    }
  }

  return interleaved
}

async function handleApi(request, env) {
  const url = new URL(request.url)

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (url.pathname === '/api/health') {
    return json({ ok: true, app: 'MV Music', runtime: 'cloudflare-workers', version: '0.2.0' })
  }

  if (url.pathname === '/api/config') {
    const key = audiusApiKey(env)
    const bearer = audiusBearer(env)
    const clientId = jamendoClientId(env)

    return json({
      providers: {
        audius: {
          enabled: Boolean(key || bearer),
          needsCredentials: !(key || bearer),
          playbackReady: Boolean(key)
        },
        jamendo: {
          enabled: Boolean(clientId),
          testingClient: clientId === JAMENDO_TEST_CLIENT_ID
        }
      },
      providerOrder: providerOrder(env)
    })
  }

  if (url.pathname === '/api/discover') {
    const tracks = await settleProviders(env, 'trending', 24)
    return json({ tracks, count: tracks.length })
  }

  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim()
    if (query.length < 2) return json({ error: 'Введите хотя бы 2 символа' }, 400)

    const tracks = await settleProviders(env, 'search', query, 20)
    return json({ query, tracks, count: tracks.length })
  }

  const trackMatch = url.pathname.match(/^\/api\/track\/(audius|jamendo)\/([^/]+)$/)
  if (trackMatch) {
    const [, provider, rawId] = trackMatch
    const id = decodeURIComponent(rawId)

    try {
      const track = provider === 'audius'
        ? await audiusTrack(env, id)
        : await jamendoTrack(env, id)

      if (!track) return json({ error: 'Трек не найден' }, 404)
      return json({ track })
    } catch (error) {
      return json({
        error: `Источник ${provider} временно недоступен`,
        detail: error?.message || String(error)
      }, 502)
    }
  }

  const playMatch = url.pathname.match(/^\/api\/play\/(audius|jamendo)\/([^/]+)$/)
  if (playMatch) {
    const [, provider, rawId] = playMatch
    const id = decodeURIComponent(rawId)

    try {
      if (provider === 'audius') {
        if (!audiusApiKey(env)) {
          return json({ error: 'Для Audius playback добавьте AUDIUS_API_KEY в Cloudflare Variables & Secrets' }, 503)
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: audiusStreamUrl(env, id),
            'cache-control': 'no-store'
          }
        })
      }

      const track = await jamendoTrack(env, id)
      if (!track?.streamUrl) return json({ error: 'Для этого трека нет stream URL' }, 404)

      return new Response(null, {
        status: 302,
        headers: {
          location: track.streamUrl,
          'cache-control': 'no-store'
        }
      })
    } catch (error) {
      return json({
        error: 'Не удалось открыть аудиопоток',
        detail: error?.message || String(error)
      }, 502)
    }
  }

  return json({ error: 'API route not found' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env)
      }

      return env.ASSETS.fetch(request)
    } catch (error) {
      console.error(error)
      return json({ error: 'Internal server error' }, 500)
    }
  }
}
