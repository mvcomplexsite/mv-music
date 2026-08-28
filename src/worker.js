const AUDIUS_BASE = 'https://api.audius.co/v1'
const JAMENDO_BASE = 'https://api.jamendo.com/v3.0'

function json(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds > 0
        ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
        : 'no-store'
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

function stripHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
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
  return safeText(env.JAMENDO_CLIENT_ID).trim()
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
    albumId: '',
    artwork,
    duration: asNumber(track.duration),
    genre: safeText(track.genre),
    plays: asNumber(track.play_count ?? track.playCount),
    streamable: track.is_streamable !== false && track.isStreamable !== false,
    sourceUrl: safeText(track.permalink),
    releaseDate: safeText(track.release_date ?? track.releaseDate)
  }
}

function normalizeJamendo(track, parent = {}) {
  if (!track) return null
  const artist = safeText(track.artist_name || parent.artist_name || parent.name, 'Неизвестный артист')
  const artistId = String(track.artist_id || parent.artist_id || parent.id || '')
  const album = safeText(track.album_name || parent.album_name || (parent.entity === 'album' ? parent.name : '') || '')
  const albumId = String(track.album_id || parent.album_id || (parent.entity === 'album' ? parent.id : '') || '')

  return {
    id: `jamendo:${track.id}`,
    provider: 'jamendo',
    providerId: String(track.id || ''),
    title: safeText(track.name, 'Без названия'),
    artist,
    artistId,
    album,
    albumId,
    artwork: safeText(track.image || track.album_image || parent.image),
    duration: asNumber(track.duration),
    genre: safeText(track.musicinfo?.tags?.genres?.[0] || ''),
    plays: asNumber(track.stats?.listening_total),
    streamable: Boolean(track.audio),
    streamUrl: safeText(track.audio),
    sourceUrl: safeText(track.shareurl || track.shorturl),
    releaseDate: safeText(track.releasedate || parent.releasedate)
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

function jamendoUrl(path, env, params = {}) {
  const clientId = jamendoClientId(env)
  if (!clientId) throw new Error('JAMENDO_CLIENT_ID is not configured')
  const url = new URL(`${JAMENDO_BASE}${path}`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('format', 'json')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

function assertJamendo(data) {
  if (data?.headers?.status && data.headers.status !== 'success') {
    throw new Error(data.headers.error_message || 'Jamendo API error')
  }
  return data
}

async function jamendoTracks(env, params = {}) {
  const url = jamendoUrl('/tracks/', env, {
    limit: Math.min(Number(params.limit || 20), 50),
    imagesize: 500,
    audioformat: 'mp32',
    type: 'single albumtrack',
    include: 'musicinfo stats',
    ...params
  })
  const data = assertJamendo(await fetchJson(url))
  return (data?.results || []).map((track) => normalizeJamendo(track)).filter(Boolean)
}

async function jamendoSearch(env, query, limit = 20) {
  return jamendoTracks(env, { search: query, limit })
}

async function jamendoTrending(env, limit = 20) {
  // Do not rely on featured=1 here: Jamendo's editorial selection can
  // legitimately return an empty result set. Use broad popularity charts
  // and fall back again if the upstream index is temporarily sparse.
  const attempts = [
    { order: 'popularity_week', groupby: 'artist_id', limit },
    { order: 'popularity_total', groupby: 'artist_id', limit },
    { order: 'releasedate_desc', limit }
  ]

  for (const params of attempts) {
    const tracks = await jamendoTracks(env, params)
    if (tracks.length) return tracks
  }

  return []
}

async function jamendoTrack(env, id) {
  const tracks = await jamendoTracks(env, { id, limit: 1 })
  return tracks[0] || null
}

async function jamendoArtist(env, id) {
  const [infoData, tracksData, albumsData] = await Promise.all([
    fetchJson(jamendoUrl('/artists/musicinfo/', env, { id, imagesize: 500 })),
    fetchJson(jamendoUrl('/artists/tracks/', env, {
      id,
      limit: 50,
      imagesize: 500,
      audioformat: 'mp32',
      track_type: 'single albumtrack',
      order: 'track_releasedate_desc'
    })),
    fetchJson(jamendoUrl('/artists/albums/', env, {
      id,
      limit: 50,
      imagesize: 500,
      order: 'album_releasedate_desc'
    }))
  ])

  assertJamendo(infoData)
  assertJamendo(tracksData)
  assertJamendo(albumsData)

  const info = infoData?.results?.[0] || tracksData?.results?.[0] || albumsData?.results?.[0]
  if (!info) return null

  const tracksParent = tracksData?.results?.[0] || info
  const albumsParent = albumsData?.results?.[0] || info
  const tracks = (tracksParent?.tracks || []).map((track) => normalizeJamendo(track, {
    id: info.id,
    name: info.name,
    artist_id: info.id,
    artist_name: info.name,
    image: track.image || info.image
  })).filter(Boolean)

  const albums = (albumsParent?.albums || []).map((album) => ({
    id: `jamendo:${album.id}`,
    provider: 'jamendo',
    providerId: String(album.id || ''),
    title: safeText(album.name, 'Без названия'),
    artist: safeText(info.name, 'Неизвестный артист'),
    artistId: String(info.id || ''),
    artwork: safeText(album.image || info.image),
    releaseDate: safeText(album.releasedate)
  }))

  return {
    id: `jamendo:${info.id}`,
    provider: 'jamendo',
    providerId: String(info.id || ''),
    name: safeText(info.name, 'Неизвестный артист'),
    artwork: safeText(info.image),
    description: stripHtml(info.musicinfo?.description || info.description || ''),
    website: safeText(info.website),
    sourceUrl: safeText(info.shareurl || info.shorturl),
    tracks,
    albums
  }
}

async function jamendoAlbum(env, id) {
  const data = assertJamendo(await fetchJson(jamendoUrl('/albums/tracks/', env, {
    id,
    limit: 1,
    imagesize: 500,
    audioformat: 'mp32',
    type: 'album single',
    order: 'track_position_asc'
  })))

  const album = data?.results?.[0]
  if (!album) return null

  const tracks = (album.tracks || []).map((track) => normalizeJamendo(track, {
    entity: 'album',
    id: album.id,
    name: album.name,
    album_id: album.id,
    album_name: album.name,
    artist_id: album.artist_id,
    artist_name: album.artist_name,
    image: album.image,
    releasedate: album.releasedate
  })).filter(Boolean)

  return {
    id: `jamendo:${album.id}`,
    provider: 'jamendo',
    providerId: String(album.id || ''),
    title: safeText(album.name, 'Без названия'),
    artist: safeText(album.artist_name, 'Неизвестный артист'),
    artistId: String(album.artist_id || ''),
    artwork: safeText(album.image),
    releaseDate: safeText(album.releasedate),
    tracks
  }
}

async function settleProviders(env, kind, ...args) {
  const diagnostics = {}
  const calls = providerOrder(env).map(async (provider) => {
    try {
      if (provider === 'audius') {
        const fn = kind === 'search' ? audiusSearch : kind === 'trending' ? audiusTrending : null
        const items = fn ? await fn(env, ...args) : []
        diagnostics[provider] = { ok: true, count: items.length }
        return items
      }
      if (provider === 'jamendo') {
        const fn = kind === 'search' ? jamendoSearch : kind === 'trending' ? jamendoTrending : null
        const items = fn ? await fn(env, ...args) : []
        diagnostics[provider] = { ok: true, count: items.length }
        return items
      }
      diagnostics[provider] = { ok: false, count: 0, error: 'Unknown provider' }
      return []
    } catch (error) {
      const message = error?.message || String(error)
      console.warn(`[provider:${provider}] ${kind} failed:`, message)
      diagnostics[provider] = { ok: false, count: 0, error: message }
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
  return { tracks: interleaved, diagnostics }
}

async function handleApi(request, env) {
  const url = new URL(request.url)

  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  if (url.pathname === '/api/health') {
    return json({ ok: true, app: 'MV Music', runtime: 'cloudflare-workers', version: '0.3.1' })
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
          configured: Boolean(clientId)
        }
      },
      providerOrder: providerOrder(env)
    })
  }

  if (url.pathname === '/api/discover') {
    const result = await settleProviders(env, 'trending', 30)
    return json({ tracks: result.tracks, count: result.tracks.length, providers: result.diagnostics }, 200)
  }

  if (url.pathname === '/api/debug/jamendo') {
    if (!jamendoClientId(env)) return json({ ok: false, error: 'JAMENDO_CLIENT_ID is not configured' }, 503)
    try {
      const tracks = await jamendoTracks(env, { order: 'popularity_week', limit: 3 })
      return json({ ok: true, count: tracks.length, sample: tracks.map(({ providerId, title, artist, streamable }) => ({ providerId, title, artist, streamable })) })
    } catch (error) {
      return json({ ok: false, error: error?.message || String(error) }, 502)
    }
  }

  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim()
    if (query.length < 2) return json({ error: 'Введите хотя бы 2 символа' }, 400)
    const result = await settleProviders(env, 'search', query, 30)
    return json({ query, tracks: result.tracks, count: result.tracks.length, providers: result.diagnostics }, 200)
  }

  const trackMatch = url.pathname.match(/^\/api\/track\/(audius|jamendo)\/([^/]+)$/)
  if (trackMatch) {
    const [, provider, rawId] = trackMatch
    const id = decodeURIComponent(rawId)
    try {
      const track = provider === 'audius' ? await audiusTrack(env, id) : await jamendoTrack(env, id)
      if (!track) return json({ error: 'Трек не найден' }, 404)
      return json({ track }, 200, 180)
    } catch (error) {
      return json({ error: `Источник ${provider} временно недоступен`, detail: error?.message || String(error) }, 502)
    }
  }

  const artistMatch = url.pathname.match(/^\/api\/artist\/(audius|jamendo)\/([^/]+)$/)
  if (artistMatch) {
    const [, provider, rawId] = artistMatch
    const id = decodeURIComponent(rawId)
    if (provider === 'audius') return json({ error: 'Страницы артистов Audius подключим после добавления API key' }, 501)
    try {
      const artist = await jamendoArtist(env, id)
      if (!artist) return json({ error: 'Исполнитель не найден' }, 404)
      return json({ artist }, 200, 300)
    } catch (error) {
      return json({ error: 'Не удалось загрузить исполнителя', detail: error?.message || String(error) }, 502)
    }
  }

  const albumMatch = url.pathname.match(/^\/api\/album\/(audius|jamendo)\/([^/]+)$/)
  if (albumMatch) {
    const [, provider, rawId] = albumMatch
    const id = decodeURIComponent(rawId)
    if (provider === 'audius') return json({ error: 'Альбомы Audius подключим после добавления API key' }, 501)
    try {
      const album = await jamendoAlbum(env, id)
      if (!album) return json({ error: 'Альбом не найден' }, 404)
      return json({ album }, 200, 300)
    } catch (error) {
      return json({ error: 'Не удалось загрузить альбом', detail: error?.message || String(error) }, 502)
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
        return new Response(null, { status: 302, headers: { location: audiusStreamUrl(env, id), 'cache-control': 'no-store' } })
      }

      const track = await jamendoTrack(env, id)
      if (!track?.streamUrl) return json({ error: 'Для этого трека нет stream URL' }, 404)
      return new Response(null, { status: 302, headers: { location: track.streamUrl, 'cache-control': 'no-store' } })
    } catch (error) {
      return json({ error: 'Не удалось открыть аудиопоток', detail: error?.message || String(error) }, 502)
    }
  }

  return json({ error: 'API route not found' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env)
      return env.ASSETS.fetch(request)
    } catch (error) {
      console.error(error)
      return json({ error: 'Internal server error' }, 500)
    }
  }
}
