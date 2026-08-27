import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = Number(process.env.PORT || 8787)
const AUDIUS_API_KEY = (process.env.AUDIUS_API_KEY || '').trim()
const AUDIUS_BEARER_TOKEN = (process.env.AUDIUS_BEARER_TOKEN || '').trim()
const JAMENDO_CLIENT_ID = (process.env.JAMENDO_CLIENT_ID || '709fa152').trim()
const PROVIDER_ORDER = (process.env.MUSIC_PROVIDERS || 'audius,jamendo')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean)

const AUDIUS_BASE = 'https://api.audius.co/v1'
const JAMENDO_BASE = 'https://api.jamendo.com/v3.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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

async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { /* ignore */ }
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}${data?.message ? `: ${data.message}` : ''}`)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

function audiusHeaders() {
  const headers = { accept: 'application/json' }
  if (AUDIUS_BEARER_TOKEN) headers.authorization = `Bearer ${AUDIUS_BEARER_TOKEN}`
  return headers
}

async function audiusSearch(query, limit = 20) {
  if (!AUDIUS_BEARER_TOKEN && !AUDIUS_API_KEY) return []
  const url = new URL(`${AUDIUS_BASE}/tracks/search`)
  url.searchParams.set('query', query)
  url.searchParams.set('limit', String(Math.min(limit, 50)))
  if (AUDIUS_API_KEY) url.searchParams.set('api_key', AUDIUS_API_KEY)
  const json = await fetchJson(url, { headers: audiusHeaders() })
  return (json?.data || []).map(normalizeAudius).filter(Boolean)
}

async function audiusTrending(limit = 20) {
  if (!AUDIUS_BEARER_TOKEN && !AUDIUS_API_KEY) return []
  const url = new URL(`${AUDIUS_BASE}/tracks/trending`)
  url.searchParams.set('limit', String(Math.min(limit, 50)))
  url.searchParams.set('time', 'week')
  if (AUDIUS_API_KEY) url.searchParams.set('api_key', AUDIUS_API_KEY)
  const json = await fetchJson(url, { headers: audiusHeaders() })
  return (json?.data || []).map(normalizeAudius).filter(Boolean)
}

async function audiusTrack(id) {
  if (!AUDIUS_BEARER_TOKEN && !AUDIUS_API_KEY) return null
  const url = new URL(`${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}`)
  if (AUDIUS_API_KEY) url.searchParams.set('api_key', AUDIUS_API_KEY)
  const json = await fetchJson(url, { headers: audiusHeaders() })
  return normalizeAudius(json?.data)
}

function audiusStreamUrl(id) {
  const url = new URL(`${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}/stream`)
  if (AUDIUS_API_KEY) url.searchParams.set('api_key', AUDIUS_API_KEY)
  return url.toString()
}

async function jamendoTracks(params = {}) {
  const url = new URL(`${JAMENDO_BASE}/tracks/`)
  url.searchParams.set('client_id', JAMENDO_CLIENT_ID)
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
  const json = await fetchJson(url)
  if (json?.headers?.status && json.headers.status !== 'success') {
    throw new Error(json.headers.error_message || 'Jamendo API error')
  }
  return (json?.results || []).map(normalizeJamendo).filter(Boolean)
}

async function jamendoSearch(query, limit = 20) {
  return jamendoTracks({ search: query, limit })
}

async function jamendoTrending(limit = 20) {
  return jamendoTracks({
    featured: '1',
    order: 'popularity_week',
    groupby: 'artist_id',
    limit
  })
}

async function jamendoTrack(id) {
  const tracks = await jamendoTracks({ id, limit: 1 })
  return tracks[0] || null
}

async function settleProviders(kind, ...args) {
  const calls = PROVIDER_ORDER.map(async (provider) => {
    try {
      if (provider === 'audius') {
        const fn = kind === 'search' ? audiusSearch : kind === 'trending' ? audiusTrending : null
        return fn ? await fn(...args) : []
      }
      if (provider === 'jamendo') {
        const fn = kind === 'search' ? jamendoSearch : kind === 'trending' ? jamendoTrending : null
        return fn ? await fn(...args) : []
      }
      return []
    } catch (error) {
      console.warn(`[provider:${provider}] ${kind} failed:`, error.message)
      return []
    }
  })
  const resultSets = await Promise.all(calls)
  const max = Math.max(0, ...resultSets.map((x) => x.length))
  const interleaved = []
  for (let i = 0; i < max; i++) {
    for (const set of resultSets) if (set[i]) interleaved.push(set[i])
  }
  return interleaved
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, app: 'MV Music', version: '0.1.0' })
  }

  if (url.pathname === '/api/config') {
    return sendJson(res, 200, {
      providers: {
        audius: {
          enabled: Boolean(AUDIUS_API_KEY || AUDIUS_BEARER_TOKEN),
          needsCredentials: !(AUDIUS_API_KEY || AUDIUS_BEARER_TOKEN)
        },
        jamendo: {
          enabled: Boolean(JAMENDO_CLIENT_ID),
          testingClient: JAMENDO_CLIENT_ID === '709fa152'
        }
      },
      providerOrder: PROVIDER_ORDER
    })
  }

  if (url.pathname === '/api/discover') {
    const tracks = await settleProviders('trending', 24)
    return sendJson(res, 200, { tracks, count: tracks.length })
  }

  if (url.pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim()
    if (q.length < 2) return sendJson(res, 400, { error: 'Введите хотя бы 2 символа' })
    const tracks = await settleProviders('search', q, 20)
    return sendJson(res, 200, { query: q, tracks, count: tracks.length })
  }

  const trackMatch = url.pathname.match(/^\/api\/track\/(audius|jamendo)\/([^/]+)$/)
  if (trackMatch) {
    const [, provider, rawId] = trackMatch
    const id = decodeURIComponent(rawId)
    try {
      const track = provider === 'audius' ? await audiusTrack(id) : await jamendoTrack(id)
      if (!track) return sendJson(res, 404, { error: 'Трек не найден' })
      return sendJson(res, 200, { track })
    } catch (error) {
      return sendJson(res, 502, { error: `Источник ${provider} временно недоступен`, detail: error.message })
    }
  }

  const playMatch = url.pathname.match(/^\/api\/play\/(audius|jamendo)\/([^/]+)$/)
  if (playMatch) {
    const [, provider, rawId] = playMatch
    const id = decodeURIComponent(rawId)
    try {
      if (provider === 'audius') {
        if (!AUDIUS_API_KEY && !AUDIUS_BEARER_TOKEN) {
          return sendJson(res, 503, { error: 'Audius пока не настроен: добавьте AUDIUS_API_KEY / AUDIUS_BEARER_TOKEN' })
        }
        // Audius stream endpoint is designed to redirect/serve an MP3 and supports browser playback.
        res.writeHead(302, { location: audiusStreamUrl(id), 'cache-control': 'no-store' })
        return res.end()
      }

      const track = await jamendoTrack(id)
      if (!track?.streamUrl) return sendJson(res, 404, { error: 'Для этого трека нет stream URL' })
      res.writeHead(302, { location: track.streamUrl, 'cache-control': 'no-store' })
      return res.end()
    } catch (error) {
      return sendJson(res, 502, { error: 'Не удалось открыть аудиопоток', detail: error.message })
    }
  }

  return sendJson(res, 404, { error: 'API route not found' })
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/') rel = '/index.html'
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel))
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' })

  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not file')
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
    })
    createReadStream(filePath).pipe(res)
  } catch {
    // SPA-like fallback.
    const html = await readFile(path.join(PUBLIC_DIR, 'index.html'))
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
    res.end(html)
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    return await serveStatic(req, res, url)
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Internal server error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MV Music: http://localhost:${PORT}`)
  console.log(`Providers: ${PROVIDER_ORDER.join(', ')}`)
  console.log(`Audius: ${AUDIUS_API_KEY || AUDIUS_BEARER_TOKEN ? 'configured' : 'not configured'}`)
  console.log(`Jamendo: ${JAMENDO_CLIENT_ID === '709fa152' ? 'TEST client' : 'custom client'}`)
})
