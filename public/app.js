const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const state = {
  tracks: [],
  currentSearch: [],
  queue: [],
  current: null,
  queueIndex: -1,
  likes: loadJSON('mv-music:likes', []),
  history: loadJSON('mv-music:history', []),
  playlists: loadJSON('mv-music:playlists', []),
  shuffle: false,
  repeat: false,
  config: null,
  pendingPlaylistTrack: null
}

const audio = $('#audio')
const els = {
  featuredCards: $('#featuredCards'), exploreList: $('#exploreList'), exploreTitle: $('#exploreTitle'), resultCount: $('#resultCount'),
  recentHome: $('#recentHome'), likesList: $('#likesList'), likesCount: $('#likesCount'), historyList: $('#historyList'),
  playlistCards: $('#playlistCards'), playlistDetail: $('#playlistDetail'), trackDetail: $('#trackDetail'), artistDetail: $('#artistDetail'), albumDetail: $('#albumDetail'),
  searchForm: $('#searchForm'), searchInput: $('#searchInput'), playerCover: $('#playerCover'), playerTitle: $('#playerTitle'), playerArtist: $('#playerArtist'),
  playerLike: $('#playerLike'), providerBadge: $('#providerBadge'), playBtn: $('#playBtn'), prevBtn: $('#prevBtn'), nextBtn: $('#nextBtn'),
  shuffleBtn: $('#shuffleBtn'), repeatBtn: $('#repeatBtn'), progress: $('#progress'), currentTime: $('#currentTime'), duration: $('#duration'),
  volume: $('#volume'), providerSummary: $('#providerSummary'), topProvider: $('#topProvider'), sidebar: $('#sidebar'), mobileMenu: $('#mobileMenu'), toast: $('#toast'),
  queueDrawer: $('#queueDrawer'), queueList: $('#queueList'), queueBtn: $('#queueBtn'), queueClose: $('#queueClose'), drawerScrim: $('#drawerScrim'),
  playlistModal: $('#playlistModal'), playlistModalTitle: $('#playlistModalTitle'), playlistModalBody: $('#playlistModalBody'), playlistModalClose: $('#playlistModalClose'),
  createPlaylistBtn: $('#createPlaylistBtn'), playLikes: $('#playLikes'), backBtn: $('#backBtn'), forwardBtn: $('#forwardBtn'), profileButton: $('#profileButton')
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)) }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
function fmtTime(sec) { sec = Math.max(0, Number(sec) || 0); return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` }
function providerName(p) { return p === 'audius' ? 'Audius' : p === 'jamendo' ? 'Jamendo' : 'MV' }
function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
}
function placeholderSvg(title = 'MV') {
  const initials = String(title).trim().slice(0, 2).toUpperCase() || 'MV'
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#292b33"/><stop offset="1" stop-color="#111216"/></linearGradient></defs><rect width="500" height="500" rx="60" fill="url(#g)"/><circle cx="250" cy="250" r="145" fill="none" stroke="#f4c83d" stroke-opacity=".18" stroke-width="2"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#f4c83d" font-family="Arial" font-size="74" font-weight="700">${initials.replace(/[<>&]/g, '')}</text></svg>`)}`
}
function img(item) { return item?.artwork || placeholderSvg(item?.title || item?.name || 'MV') }
function isLiked(track) { return state.likes.some(x => x.id === track?.id) }
function toast(message) {
  els.toast.textContent = message
  els.toast.classList.add('show')
  clearTimeout(toast.t)
  toast.t = setTimeout(() => els.toast.classList.remove('show'), 1900)
}
async function api(path) {
  const res = await fetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function allKnownTracks() {
  const fromPlaylists = state.playlists.flatMap(p => p.tracks || [])
  return [state.current, ...state.tracks, ...state.currentSearch, ...state.queue, ...state.likes, ...state.history, ...fromPlaylists].filter(Boolean)
}
function findTrack(id) { return allKnownTracks().find(x => x.id === id) }
function setTracks(tracks = []) {
  const map = new Map(state.tracks.map(t => [t.id, t]))
  for (const track of tracks) if (track?.id) map.set(track.id, track)
  state.tracks = [...map.values()]
}

function cardTemplate(track) {
  return `<article class="music-card">
    <div class="cover-wrap">
      <button class="track-cover-action" data-action="track" data-id="${escapeHtml(track.id)}" aria-label="Открыть ${escapeHtml(track.title)}"><img loading="lazy" src="${escapeHtml(img(track))}" alt=""></button>
      <button class="card-play" data-action="play" data-id="${escapeHtml(track.id)}" aria-label="Играть">▶</button>
    </div>
    <h3>${escapeHtml(track.title)}</h3>
    <p><span class="source-dot ${escapeHtml(track.provider)}"></span><button class="inline-artist" data-action="artist" data-provider="${escapeHtml(track.provider)}" data-provider-id="${escapeHtml(track.artistId)}">${escapeHtml(track.artist)}</button></p>
  </article>`
}

function rowTemplate(track, index = 0, options = {}) {
  const liked = isLiked(track)
  const albumButton = track.album && track.albumId
    ? `<button class="album-button" data-action="album" data-provider="${escapeHtml(track.provider)}" data-provider-id="${escapeHtml(track.albumId)}">${escapeHtml(track.album)}</button>`
    : `<span class="album-button">${escapeHtml(track.album || providerName(track.provider))}</span>`
  const remove = options.playlistId
    ? `<button class="row-btn" data-action="playlist-remove" data-playlist-id="${escapeHtml(options.playlistId)}" data-id="${escapeHtml(track.id)}" title="Убрать из плейлиста">×</button>`
    : `<button class="row-btn" data-action="playlist" data-id="${escapeHtml(track.id)}" title="Добавить в плейлист">＋</button>`
  return `<article class="track-row ${state.current?.id === track.id ? 'playing' : ''}">
    <div class="track-index">${String(index + 1).padStart(2, '0')}</div>
    <button class="track-cover" data-action="track" data-id="${escapeHtml(track.id)}"><img loading="lazy" src="${escapeHtml(img(track))}" alt=""></button>
    <div class="track-main">
      <button class="track-title-button" data-action="track" data-id="${escapeHtml(track.id)}">${escapeHtml(track.title)}</button>
      <button class="artist-button" data-action="artist" data-provider="${escapeHtml(track.provider)}" data-provider-id="${escapeHtml(track.artistId)}">${escapeHtml(track.artist)}</button>
    </div>
    <div class="track-album">${albumButton}</div>
    <div class="track-duration">${fmtTime(track.duration)}</div>
    <div class="track-row-actions">${remove}<button class="row-btn ${liked ? 'liked' : ''}" data-action="like" data-id="${escapeHtml(track.id)}">${liked ? '♥' : '♡'}</button><button class="row-btn" data-action="play" data-id="${escapeHtml(track.id)}">▶</button></div>
  </article>`
}

function renderFeatured(tracks) {
  const slice = tracks.slice(0, 6)
  els.featuredCards.innerHTML = slice.length ? slice.map(cardTemplate).join('') : `<div class="empty-state" style="grid-column:1/-1;margin:30px auto"><h3>Рекомендации пока не загрузились</h3><p>Попробуй обновить страницу через несколько секунд.</p></div>`
}
function renderExplore(tracks) {
  els.exploreList.innerHTML = tracks.length ? tracks.map(rowTemplate).join('') : `<div class="empty-state"><h3>Ничего не найдено</h3><p>Попробуй другой запрос.</p></div>`
  els.resultCount.textContent = tracks.length ? `${tracks.length} треков` : ''
}
function renderLibrary() {
  els.likesCount.textContent = `${state.likes.length} треков`
  els.likesList.innerHTML = state.likes.length ? state.likes.map(rowTemplate).join('') : `<div class="empty-state"><div class="empty-art">♥</div><h3>Здесь пока пусто</h3><p>Нажимай ♡ возле треков — они останутся в твоей MV-библиотеке.</p></div>`
  els.historyList.innerHTML = state.history.length ? state.history.map(rowTemplate).join('') : `<div class="empty-state"><div class="empty-art">↺</div><h3>История пустая</h3><p>Включи любой трек, и он появится здесь.</p></div>`
  els.recentHome.innerHTML = state.history.length ? state.history.slice(0, 6).map(rowTemplate).join('') : `<div class="track-row"><div class="track-index">—</div><div class="track-cover"></div><div class="track-main"><span class="track-title-button">Здесь появятся недавние треки</span><span class="artist-button">Начни слушать рекомендации выше</span></div></div>`
  renderPlaylists()
}

function playlistCoverTemplate(playlist) {
  const tracks = (playlist.tracks || []).slice(0, 4)
  if (!tracks.length) return `<div class="playlist-cover empty">♪</div>`
  const images = [...tracks]
  while (images.length < 4) images.push(images[images.length - 1])
  return `<div class="playlist-cover generated">${images.map(t => `<img src="${escapeHtml(img(t))}" alt="">`).join('')}</div>`
}
function renderPlaylists() {
  els.playlistCards.innerHTML = state.playlists.length
    ? state.playlists.map(p => `<article class="playlist-card" data-action="playlist-open" data-playlist-id="${escapeHtml(p.id)}">${playlistCoverTemplate(p)}<h3>${escapeHtml(p.name)}</h3><p>${p.tracks?.length || 0} треков</p></article>`).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-art">＋</div><h3>Создай первый плейлист</h3><p>Плейлисты уже работают и пока сохраняются в браузере.</p><button class="primary" data-action="playlist-create">Создать плейлист</button></div>`
}

function toggleLike(track) {
  const idx = state.likes.findIndex(x => x.id === track.id)
  if (idx >= 0) { state.likes.splice(idx, 1); toast('Убрано из «Мне нравится»') }
  else { state.likes.unshift(track); toast('Добавлено в «Мне нравится»') }
  saveJSON('mv-music:likes', state.likes)
  renderLibrary()
  updatePlayer()
  if ($('#exploreView').classList.contains('active-view')) renderExplore(state.currentSearch.length ? state.currentSearch : state.queue)
  if ($('#playlistDetailView').classList.contains('active-view')) {
    const id = decodeRoutePart(location.hash.split('/')[2] || '')
    const playlist = state.playlists.find(p => p.id === id)
    if (playlist) renderPlaylistDetail(playlist)
  }
}
function addHistory(track) {
  state.history = [track, ...state.history.filter(x => x.id !== track.id)].slice(0, 80)
  saveJSON('mv-music:history', state.history)
  renderLibrary()
}

async function playTrack(track, queue = null) {
  if (!track) return
  state.current = track
  if (queue?.length) state.queue = [...queue]
  if (!state.queue.some(x => x.id === track.id)) state.queue = [track, ...state.queue]
  state.queueIndex = state.queue.findIndex(x => x.id === track.id)
  updatePlayer()
  renderQueue()
  addHistory(track)
  audio.src = `/api/play/${encodeURIComponent(track.provider)}/${encodeURIComponent(track.providerId)}`
  try { await audio.play() } catch { toast('Нажми Play ещё раз, если браузер заблокировал запуск') }
}
function updatePlayer() {
  const t = state.current
  if (!t) return
  els.playerCover.innerHTML = `<img src="${escapeHtml(img(t))}" alt="">`
  els.playerTitle.textContent = t.title
  els.playerArtist.textContent = t.artist
  els.providerBadge.textContent = providerName(t.provider)
  els.playerLike.textContent = isLiked(t) ? '♥' : '♡'
  els.playerLike.classList.toggle('liked', isLiked(t))
  document.title = `${t.title} — ${t.artist} | MV Music`
  $$('.track-row').forEach(row => row.classList.remove('playing'))
  updateMediaSession(t)
}
function nextTrack(direction = 1) {
  if (!state.queue.length) return
  if (state.shuffle) state.queueIndex = Math.floor(Math.random() * state.queue.length)
  else state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length
  playTrack(state.queue[state.queueIndex])
}
function renderQueue() {
  els.queueList.innerHTML = state.queue.length
    ? state.queue.map((track, i) => `<div class="queue-item ${state.current?.id === track.id ? 'active' : ''}" data-action="play" data-id="${escapeHtml(track.id)}"><img src="${escapeHtml(img(track))}" alt=""><div><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div><div class="queue-number">${i + 1}</div></div>`).join('')
    : `<div class="empty-state"><h3>Очередь пустая</h3><p>Запусти любой трек.</p></div>`
}
function toggleQueue(force) {
  const open = typeof force === 'boolean' ? force : !els.queueDrawer.classList.contains('open')
  els.queueDrawer.classList.toggle('open', open)
  els.drawerScrim.classList.toggle('open', open)
  els.queueDrawer.setAttribute('aria-hidden', String(!open))
  if (open) renderQueue()
}

function createPlaylist(name, firstTrack = null) {
  const clean = String(name || '').trim().slice(0, 60)
  if (!clean) return null
  const playlist = { id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: clean, tracks: firstTrack ? [firstTrack] : [], createdAt: Date.now() }
  state.playlists.unshift(playlist)
  saveJSON('mv-music:playlists', state.playlists)
  renderPlaylists()
  toast(`Плейлист «${clean}» создан`)
  return playlist
}
function addTrackToPlaylist(playlistId, track) {
  const playlist = state.playlists.find(p => p.id === playlistId)
  if (!playlist || !track) return
  if (playlist.tracks.some(t => t.id === track.id)) return toast('Этот трек уже есть в плейлисте')
  playlist.tracks.push(track)
  saveJSON('mv-music:playlists', state.playlists)
  renderPlaylists()
  closePlaylistModal()
  toast(`Добавлено в «${playlist.name}»`)
}
function removeTrackFromPlaylist(playlistId, trackId) {
  const playlist = state.playlists.find(p => p.id === playlistId)
  if (!playlist) return
  playlist.tracks = playlist.tracks.filter(t => t.id !== trackId)
  saveJSON('mv-music:playlists', state.playlists)
  renderPlaylists()
  renderPlaylistDetail(playlist)
  toast('Трек убран из плейлиста')
}
function deletePlaylist(playlistId) {
  const playlist = state.playlists.find(p => p.id === playlistId)
  if (!playlist) return
  if (!confirm(`Удалить плейлист «${playlist.name}»?`)) return
  state.playlists = state.playlists.filter(p => p.id !== playlistId)
  saveJSON('mv-music:playlists', state.playlists)
  renderPlaylists()
  navigate('playlists')
  toast('Плейлист удалён')
}
function openPlaylistModal(track = null) {
  state.pendingPlaylistTrack = track
  els.playlistModalTitle.textContent = track ? 'Добавить в плейлист' : 'Новый плейлист'
  const list = track && state.playlists.length
    ? `<div class="modal-list">${state.playlists.map(p => `<button data-action="modal-add-playlist" data-playlist-id="${escapeHtml(p.id)}"><span class="mini-cover">♪</span><span><strong>${escapeHtml(p.name)}</strong><small>${p.tracks.length} треков</small></span></button>`).join('')}</div>`
    : track ? `<p class="detail-description">Плейлистов пока нет — создай первый ниже.</p>` : ''
  els.playlistModalBody.innerHTML = `${list}<div class="new-playlist-row"><input id="playlistNameInput" maxlength="60" placeholder="Название плейлиста"><button class="primary" data-action="modal-create-playlist">Создать</button></div>`
  els.playlistModal.hidden = false
  setTimeout(() => $('#playlistNameInput')?.focus(), 20)
}
function closePlaylistModal() { els.playlistModal.hidden = true; state.pendingPlaylistTrack = null }

function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active-view'))
  $(`#${name}View`)?.classList.add('active-view')
  const navName = ['home', 'explore', 'likes', 'history', 'playlists'].includes(name) ? name : ''
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === navName))
  els.sidebar.classList.remove('open')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function encodeRoutePart(value) { return encodeURIComponent(String(value || '')) }
function decodeRoutePart(value) { try { return decodeURIComponent(value) } catch { return value } }
function navigate(route, replace = false) {
  const hash = `#${route}`
  if (location.hash === hash) return handleRoute()
  if (replace) history.replaceState(null, '', hash)
  else location.hash = hash
  if (replace) handleRoute()
}

async function doSearch(query) {
  showView('explore')
  els.searchInput.value = query
  els.exploreTitle.textContent = `Результаты: «${query}»`
  els.exploreList.innerHTML = `<div class="skeleton-grid"></div>`
  els.resultCount.textContent = 'ищем…'
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`)
    setTracks(data.tracks)
    state.currentSearch = data.tracks
    state.queue = data.tracks
    renderExplore(data.tracks)
  } catch (e) {
    els.resultCount.textContent = ''
    els.exploreList.innerHTML = `<div class="empty-state"><h3>Поиск временно недоступен</h3><p>${escapeHtml(e.message)}</p></div>`
  }
}

function detailHero({ artwork, kind, title, subtitle = '', meta = '', artist = false, actions = '', description = '' }) {
  return `<button class="back-link detail-back" data-action="back">← Назад</button><div class="detail-hero">
    <div class="detail-cover ${artist ? 'artist-cover' : ''}"><img src="${escapeHtml(artwork || placeholderSvg(title))}" alt=""></div>
    <div class="detail-copy"><span class="eyebrow">${escapeHtml(kind)}</span><h1>${escapeHtml(title)}</h1>${subtitle}${meta ? `<div class="detail-meta">${meta}</div>` : ''}${actions ? `<div class="detail-actions">${actions}</div>` : ''}</div>
  </div>${description ? `<p class="detail-description">${escapeHtml(description)}</p>` : ''}`
}

async function openTrack(provider, providerId) {
  showView('track')
  els.trackDetail.innerHTML = `<div class="skeleton-grid"></div>`
  let track = allKnownTracks().find(t => t.provider === provider && String(t.providerId) === String(providerId))
  try {
    const data = await api(`/api/track/${encodeURIComponent(provider)}/${encodeURIComponent(providerId)}`)
    track = data.track || track
    if (track) setTracks([track])
  } catch (e) {
    if (!track) return els.trackDetail.innerHTML = `<div class="empty-state"><h3>Трек не загрузился</h3><p>${escapeHtml(e.message)}</p></div>`
  }
  if (!track) return
  const artistBtn = track.artistId ? `<button class="artist-link-hero" data-action="artist" data-provider="${escapeHtml(track.provider)}" data-provider-id="${escapeHtml(track.artistId)}">${escapeHtml(track.artist)}</button>` : escapeHtml(track.artist)
  const albumMeta = track.album ? ` • ${escapeHtml(track.album)}` : ''
  els.trackDetail.innerHTML = detailHero({
    artwork: img(track), kind: 'ТРЕК', title: track.title,
    subtitle: `<p>${artistBtn}${albumMeta}</p>`,
    meta: `<span>${providerName(track.provider)}</span>${track.releaseDate ? `<span>•</span><span>${escapeHtml(formatDate(track.releaseDate))}</span>` : ''}<span>•</span><span>${fmtTime(track.duration)}</span>`,
    actions: `<button class="primary" data-action="play" data-id="${escapeHtml(track.id)}">▶ Слушать</button><button class="ghost" data-action="like" data-id="${escapeHtml(track.id)}">${isLiked(track) ? '♥ В любимых' : '♡ Нравится'}</button><button class="ghost" data-action="playlist" data-id="${escapeHtml(track.id)}">＋ Плейлист</button>`
  }) + `<div class="detail-body"><section class="section"><div class="section-head"><div><span class="eyebrow">ДАЛЬШЕ</span><h2>Ещё от исполнителя</h2></div></div><div class="track-list" id="moreArtistTracks"></div></section></div>`
  const local = allKnownTracks().filter(t => t.artistId && t.artistId === track.artistId && t.id !== track.id).slice(0, 8)
  $('#moreArtistTracks').innerHTML = local.length ? local.map(rowTemplate).join('') : `<div class="empty-state"><p>Открой страницу исполнителя, чтобы посмотреть больше треков.</p></div>`
}

async function openArtist(provider, providerId) {
  showView('artist')
  els.artistDetail.innerHTML = `<div class="skeleton-grid"></div>`
  if (!providerId) return els.artistDetail.innerHTML = `<div class="empty-state"><h3>Нет ID исполнителя</h3></div>`
  if (provider !== 'jamendo') {
    const tracks = allKnownTracks().filter(t => t.provider === provider && String(t.artistId) === String(providerId))
    const first = tracks[0]
    els.artistDetail.innerHTML = detailHero({ artwork: img(first), kind: 'ИСПОЛНИТЕЛЬ', title: first?.artist || 'Исполнитель', artist: true, meta: `<span>${providerName(provider)}</span>`, actions: tracks.length ? `<button class="primary" data-action="play" data-id="${escapeHtml(first.id)}">▶ Слушать</button>` : '' }) + `<div class="detail-body"><section class="section"><div class="section-head"><h2>Доступные треки</h2></div><div class="track-list large">${tracks.length ? tracks.map(rowTemplate).join('') : '<div class="empty-state"><p>Подключим полную страницу после настройки Audius API.</p></div>'}</div></section></div>`
    return
  }
  try {
    const { artist } = await api(`/api/artist/jamendo/${encodeURIComponent(providerId)}`)
    setTracks(artist.tracks)
    els.artistDetail.innerHTML = detailHero({
      artwork: artist.artwork || img(artist.tracks[0]), kind: 'ИСПОЛНИТЕЛЬ', title: artist.name, artist: true,
      meta: `<span>Jamendo</span><span>•</span><span>${artist.tracks.length} треков</span>`,
      actions: artist.tracks.length ? `<button class="primary" data-action="play" data-id="${escapeHtml(artist.tracks[0].id)}">▶ Слушать</button>` : '',
      description: artist.description
    }) + `<div class="detail-body"><section class="section"><div class="section-head"><div><span class="eyebrow">ПОПУЛЯРНОЕ</span><h2>Треки</h2></div></div><div class="track-list large">${artist.tracks.length ? artist.tracks.slice(0, 20).map(rowTemplate).join('') : '<div class="empty-state"><p>Треков пока нет.</p></div>'}</div></section><section class="section"><div class="section-head"><div><span class="eyebrow">РЕЛИЗЫ</span><h2>Альбомы</h2></div></div><div class="album-grid">${artist.albums.length ? artist.albums.map(albumCardTemplate).join('') : '<div class="empty-state"><p>Альбомов не найдено.</p></div>'}</div></section></div>`
  } catch (e) {
    els.artistDetail.innerHTML = `<button class="back-link" data-action="back">← Назад</button><div class="empty-state"><h3>Исполнитель не загрузился</h3><p>${escapeHtml(e.message)}</p></div>`
  }
}
function albumCardTemplate(album) {
  return `<article class="album-card" data-action="album" data-provider="${escapeHtml(album.provider)}" data-provider-id="${escapeHtml(album.providerId)}"><div class="album-cover"><img loading="lazy" src="${escapeHtml(img(album))}" alt=""></div><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.releaseDate ? formatDate(album.releaseDate) : album.artist)}</p></article>`
}
async function openAlbum(provider, providerId) {
  showView('album')
  els.albumDetail.innerHTML = `<div class="skeleton-grid"></div>`
  if (provider !== 'jamendo') return els.albumDetail.innerHTML = `<button class="back-link" data-action="back">← Назад</button><div class="empty-state"><h3>Альбом пока недоступен</h3><p>Полные страницы Audius включим после API key.</p></div>`
  try {
    const { album } = await api(`/api/album/jamendo/${encodeURIComponent(providerId)}`)
    setTracks(album.tracks)
    const artistBtn = `<button class="artist-link-hero" data-action="artist" data-provider="jamendo" data-provider-id="${escapeHtml(album.artistId)}">${escapeHtml(album.artist)}</button>`
    els.albumDetail.innerHTML = detailHero({
      artwork: album.artwork || img(album.tracks[0]), kind: 'АЛЬБОМ', title: album.title,
      subtitle: `<p>${artistBtn}</p>`, meta: `<span>Jamendo</span>${album.releaseDate ? `<span>•</span><span>${escapeHtml(formatDate(album.releaseDate))}</span>` : ''}<span>•</span><span>${album.tracks.length} треков</span>`,
      actions: album.tracks.length ? `<button class="primary" data-action="play" data-id="${escapeHtml(album.tracks[0].id)}">▶ Слушать</button>` : ''
    }) + `<div class="detail-body"><div class="track-list large">${album.tracks.map(rowTemplate).join('')}</div></div>`
  } catch (e) {
    els.albumDetail.innerHTML = `<button class="back-link" data-action="back">← Назад</button><div class="empty-state"><h3>Альбом не загрузился</h3><p>${escapeHtml(e.message)}</p></div>`
  }
}
function renderPlaylistDetail(playlist) {
  const first = playlist.tracks[0]
  els.playlistDetail.innerHTML = detailHero({
    artwork: first ? img(first) : placeholderSvg(playlist.name), kind: 'MV ПЛЕЙЛИСТ', title: playlist.name,
    meta: `<span>${playlist.tracks.length} треков</span><span>•</span><span>сохранён на этом устройстве</span>`,
    actions: `${playlist.tracks.length ? `<button class="primary" data-action="play" data-id="${escapeHtml(first.id)}">▶ Слушать</button>` : ''}<button class="ghost" data-action="playlist-delete" data-playlist-id="${escapeHtml(playlist.id)}">Удалить</button>`
  }) + `<div class="detail-body"><div class="track-list large">${playlist.tracks.length ? playlist.tracks.map((t, i) => rowTemplate(t, i, { playlistId: playlist.id })).join('') : '<div class="empty-state"><h3>Плейлист пуст</h3><p>Добавляй треки кнопкой ＋ возле любой песни.</p></div>'}</div></div>`
}
function openPlaylistDetail(id) {
  const playlist = state.playlists.find(p => p.id === id)
  showView('playlistDetail')
  if (!playlist) return els.playlistDetail.innerHTML = `<div class="empty-state"><h3>Плейлист не найден</h3></div>`
  setTracks(playlist.tracks)
  renderPlaylistDetail(playlist)
}

function handleRoute() {
  const raw = location.hash.replace(/^#/, '') || 'home'
  const parts = raw.split('/')
  const route = parts[0]
  if (route === 'search') return doSearch(decodeRoutePart(parts.slice(1).join('/')))
  if (route === 'track') return openTrack(parts[1], decodeRoutePart(parts[2] || ''))
  if (route === 'artist') return openArtist(parts[1], decodeRoutePart(parts[2] || ''))
  if (route === 'album') return openAlbum(parts[1], decodeRoutePart(parts[2] || ''))
  if (route === 'playlist') return openPlaylistDetail(decodeRoutePart(parts[1] || ''))
  if (route === 'likes' || route === 'history' || route === 'playlists') renderLibrary()
  if (['home', 'explore', 'likes', 'history', 'playlists'].includes(route)) return showView(route)
  navigate('home', true)
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: track.album || 'MV Music',
      artwork: [{ src: img(track), sizes: '500x500' }]
    })
  } catch { /* unsupported artwork scheme or browser */ }
}
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const handlers = { play: () => audio.play(), pause: () => audio.pause(), previoustrack: () => nextTrack(-1), nexttrack: () => nextTrack(1) }
  for (const [action, handler] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* unsupported action */ }
  }
}

async function load() {
  renderLibrary()
  setupMediaSession()
  try {
    state.config = await api('/api/config')
    const enabled = Object.entries(state.config.providers).filter(([, v]) => v.enabled).map(([k]) => providerName(k))
    els.providerSummary.textContent = enabled.join(' + ') || 'не настроены'
    els.topProvider.lastElementChild.textContent = enabled.join(' + ') || 'MV Music'
  } catch { els.providerSummary.textContent = 'ошибка' }
  try {
    const data = await api('/api/discover')
    setTracks(data.tracks)
    state.queue = data.tracks
    state.currentSearch = data.tracks
    renderFeatured(data.tracks)
    renderExplore(data.tracks)
  } catch (e) {
    renderFeatured([])
    els.exploreList.innerHTML = `<div class="empty-state"><h3>Каталог не загрузился</h3><p>${escapeHtml(e.message)}</p></div>`
  }
  handleRoute()
}

document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]')
  if (view) { e.preventDefault(); return navigate(view.dataset.view) }
  const search = e.target.closest('[data-search]')
  if (search) { e.preventDefault(); els.searchInput.value = search.dataset.search; return navigate(`search/${encodeRoutePart(search.dataset.search)}`) }
  const actionEl = e.target.closest('[data-action]')
  if (!actionEl) return
  const action = actionEl.dataset.action
  const track = actionEl.dataset.id ? findTrack(actionEl.dataset.id) : null
  if (action === 'play' && track) return playTrack(track, state.currentSearch.includes(track) ? state.currentSearch : null)
  if (action === 'like' && track) return toggleLike(track)
  if (action === 'track' && track) return navigate(`track/${track.provider}/${encodeRoutePart(track.providerId)}`)
  if (action === 'artist') return navigate(`artist/${actionEl.dataset.provider}/${encodeRoutePart(actionEl.dataset.providerId)}`)
  if (action === 'album') return navigate(`album/${actionEl.dataset.provider}/${encodeRoutePart(actionEl.dataset.providerId)}`)
  if (action === 'playlist' && track) return openPlaylistModal(track)
  if (action === 'playlist-open') return navigate(`playlist/${encodeRoutePart(actionEl.dataset.playlistId)}`)
  if (action === 'playlist-create') return openPlaylistModal()
  if (action === 'playlist-delete') return deletePlaylist(actionEl.dataset.playlistId)
  if (action === 'playlist-remove') return removeTrackFromPlaylist(actionEl.dataset.playlistId, actionEl.dataset.id)
  if (action === 'modal-add-playlist') return addTrackToPlaylist(actionEl.dataset.playlistId, state.pendingPlaylistTrack)
  if (action === 'modal-create-playlist') {
    const name = $('#playlistNameInput')?.value
    const playlist = createPlaylist(name, state.pendingPlaylistTrack)
    if (playlist) closePlaylistModal()
    return
  }
  if (action === 'back') return history.back()
})

els.searchForm.addEventListener('submit', e => {
  e.preventDefault(); const q = els.searchInput.value.trim()
  if (q.length >= 2) navigate(`search/${encodeRoutePart(q)}`); else toast('Введите хотя бы 2 символа')
})
els.mobileMenu.addEventListener('click', () => els.sidebar.classList.toggle('open'))
els.backBtn.addEventListener('click', () => history.back())
els.forwardBtn.addEventListener('click', () => history.forward())
els.profileButton.addEventListener('click', () => toast('MV Account подключим следующим этапом'))
$('#heroPlay').addEventListener('click', () => state.queue.length ? playTrack(state.queue[0], state.queue) : toast('Каталог ещё загружается'))
els.playLikes.addEventListener('click', () => state.likes.length ? playTrack(state.likes[0], state.likes) : toast('Сначала добавь понравившиеся треки'))
els.createPlaylistBtn.addEventListener('click', () => openPlaylistModal())
els.playerLike.addEventListener('click', () => state.current && toggleLike(state.current))
els.playerCover.addEventListener('click', () => state.current && navigate(`track/${state.current.provider}/${encodeRoutePart(state.current.providerId)}`))
els.playerArtist.addEventListener('click', () => state.current?.artistId && navigate(`artist/${state.current.provider}/${encodeRoutePart(state.current.artistId)}`))
els.playBtn.addEventListener('click', async () => {
  if (!state.current && state.queue.length) return playTrack(state.queue[0], state.queue)
  if (!state.current) return
  if (audio.paused) await audio.play().catch(() => toast('Не удалось запустить')); else audio.pause()
})
els.prevBtn.addEventListener('click', () => nextTrack(-1))
els.nextBtn.addEventListener('click', () => nextTrack(1))
els.shuffleBtn.addEventListener('click', () => { state.shuffle = !state.shuffle; els.shuffleBtn.style.color = state.shuffle ? 'var(--accent)' : ''; toast(state.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено') })
els.repeatBtn.addEventListener('click', () => { state.repeat = !state.repeat; audio.loop = state.repeat; els.repeatBtn.style.color = state.repeat ? 'var(--accent)' : ''; toast(state.repeat ? 'Повтор включён' : 'Повтор выключен') })
els.queueBtn.addEventListener('click', () => toggleQueue())
els.queueClose.addEventListener('click', () => toggleQueue(false))
els.drawerScrim.addEventListener('click', () => toggleQueue(false))
els.playlistModalClose.addEventListener('click', closePlaylistModal)
els.playlistModal.addEventListener('click', e => { if (e.target === els.playlistModal) closePlaylistModal() })
els.playlistModal.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'playlistNameInput') $('[data-action="modal-create-playlist"]')?.click() })
els.volume.addEventListener('input', () => { audio.volume = Number(els.volume.value) })
audio.volume = Number(els.volume.value)
audio.addEventListener('play', () => { els.playBtn.textContent = 'Ⅱ'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' })
audio.addEventListener('pause', () => { els.playBtn.textContent = '▶'; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' })
audio.addEventListener('loadedmetadata', () => { els.duration.textContent = fmtTime(audio.duration || state.current?.duration) })
audio.addEventListener('timeupdate', () => {
  const ratio = audio.duration ? audio.currentTime / audio.duration : 0
  els.progress.value = String(Math.round(ratio * 1000)); els.currentTime.textContent = fmtTime(audio.currentTime); els.duration.textContent = fmtTime(audio.duration || state.current?.duration)
  if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }) } catch { /* unsupported */ }
  }
})
audio.addEventListener('ended', () => { if (!state.repeat) nextTrack(1) })
audio.addEventListener('error', () => { if (audio.src) toast('Источник не отдал аудио. Попробуй другой трек.') })
els.progress.addEventListener('input', () => { if (audio.duration) audio.currentTime = Number(els.progress.value) / 1000 * audio.duration })
window.addEventListener('hashchange', handleRoute)
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    e.preventDefault(); els.playBtn.click()
  }
  if (e.key === 'Escape') { toggleQueue(false); closePlaylistModal() }
})

load()
