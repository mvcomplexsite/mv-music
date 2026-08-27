const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const state = {
  tracks: [],
  queue: [],
  current: null,
  queueIndex: -1,
  likes: loadJSON('mv-music:likes', []),
  history: loadJSON('mv-music:history', []),
  shuffle: false,
  repeat: false,
  config: null
}

const audio = $('#audio')
const els = {
  content: $('#content'),
  featuredCards: $('#featuredCards'),
  exploreList: $('#exploreList'),
  exploreTitle: $('#exploreTitle'),
  resultCount: $('#resultCount'),
  recentHome: $('#recentHome'),
  likesList: $('#likesList'),
  likesCount: $('#likesCount'),
  historyList: $('#historyList'),
  searchForm: $('#searchForm'),
  searchInput: $('#searchInput'),
  playerCover: $('#playerCover'),
  playerTitle: $('#playerTitle'),
  playerArtist: $('#playerArtist'),
  playerLike: $('#playerLike'),
  providerBadge: $('#providerBadge'),
  playBtn: $('#playBtn'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  shuffleBtn: $('#shuffleBtn'),
  repeatBtn: $('#repeatBtn'),
  progress: $('#progress'),
  currentTime: $('#currentTime'),
  duration: $('#duration'),
  volume: $('#volume'),
  providerSummary: $('#providerSummary'),
  sidebar: $('#sidebar'),
  mobileMenu: $('#mobileMenu'),
  toast: $('#toast')
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)) }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
function fmtTime(sec) { sec = Math.max(0, Number(sec) || 0); return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2,'0')}` }
function providerName(p) { return p === 'audius' ? 'Audius' : p === 'jamendo' ? 'Jamendo' : 'MV' }
function placeholderSvg(title = 'MV') {
  const initials = title.trim().slice(0,2).toUpperCase() || 'MV'
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b2d35"/><stop offset="1" stop-color="#111216"/></linearGradient></defs><rect width="500" height="500" rx="60" fill="url(#g)"/><circle cx="250" cy="250" r="145" fill="none" stroke="#f4c83d" stroke-opacity=".18" stroke-width="2"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#f4c83d" font-family="Arial" font-size="74" font-weight="700">${escapeHtml(initials)}</text></svg>`)}`
}
function img(track) { return track?.artwork || placeholderSvg(track?.title || 'MV') }
function isLiked(track) { return state.likes.some(x => x.id === track?.id) }
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(()=>els.toast.classList.remove('show'), 1900) }

async function api(path) {
  const res = await fetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function cardTemplate(track) {
  return `<article class="music-card" data-track-id="${escapeHtml(track.id)}">
    <div class="cover-wrap"><img loading="lazy" src="${escapeHtml(img(track))}" alt=""><button class="card-play" data-play="${escapeHtml(track.id)}">▶</button></div>
    <h3>${escapeHtml(track.title)}</h3>
    <p><span class="source-dot ${track.provider}"></span>${escapeHtml(track.artist)}</p>
  </article>`
}

function rowTemplate(track, index = 0) {
  const liked = isLiked(track)
  return `<article class="track-row" data-track-id="${escapeHtml(track.id)}">
    <div class="track-index">${String(index + 1).padStart(2,'0')}</div>
    <div class="track-cover"><img loading="lazy" src="${escapeHtml(img(track))}" alt=""></div>
    <div class="track-main"><strong>${escapeHtml(track.title)}</strong><span><span class="source-dot ${track.provider}"></span>${escapeHtml(track.artist)}</span></div>
    <div class="track-album">${escapeHtml(track.album || providerName(track.provider))}</div>
    <div class="track-duration">${fmtTime(track.duration)}</div>
    <div class="track-row-actions"><button class="row-btn ${liked ? 'liked':''}" data-like="${escapeHtml(track.id)}">${liked ? '♥':'♡'}</button><button class="row-btn" data-play="${escapeHtml(track.id)}">▶</button></div>
  </article>`
}

function bindTrackActions(root = document) {
  $$('[data-play]', root).forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation(); const track = findTrack(btn.dataset.play); if (track) playTrack(track)
  }))
  $$('[data-like]', root).forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation(); const track = findTrack(btn.dataset.like); if (track) toggleLike(track)
  }))
  $$('[data-track-id]', root).forEach(row => row.addEventListener('dblclick', () => {
    const track = findTrack(row.dataset.trackId); if (track) playTrack(track)
  }))
}

function findTrack(id) {
  return [...state.tracks, ...state.likes, ...state.history].find(x => x.id === id)
}

function setTracks(tracks) {
  const map = new Map()
  for (const t of [...state.tracks, ...tracks]) map.set(t.id, t)
  state.tracks = [...map.values()]
  if (!state.queue.length) state.queue = tracks
}

function renderFeatured(tracks) {
  const slice = tracks.slice(0, 6)
  els.featuredCards.innerHTML = slice.length ? slice.map(cardTemplate).join('') : `<div class="empty-state" style="grid-column:1/-1;margin:30px auto"><h3>Не удалось загрузить рекомендации</h3><p>Проверь интернет или настройки провайдеров.</p></div>`
  bindTrackActions(els.featuredCards)
}
function renderExplore(tracks) {
  els.exploreList.innerHTML = tracks.length ? tracks.map(rowTemplate).join('') : `<div class="empty-state"><h3>Ничего не найдено</h3><p>Попробуй другой запрос.</p></div>`
  els.resultCount.textContent = tracks.length ? `${tracks.length} треков` : ''
  bindTrackActions(els.exploreList)
}
function renderLibrary() {
  els.likesCount.textContent = `${state.likes.length} треков`
  els.likesList.innerHTML = state.likes.length ? state.likes.map(rowTemplate).join('') : `<div class="empty-state"><div class="empty-art">♥</div><h3>Здесь пока пусто</h3><p>Нажимай ♡ возле треков — они останутся в твоей MV-библиотеке.</p></div>`
  els.historyList.innerHTML = state.history.length ? state.history.map(rowTemplate).join('') : `<div class="empty-state"><div class="empty-art">↺</div><h3>История пустая</h3><p>Включи любой трек, и он появится здесь.</p></div>`
  els.recentHome.innerHTML = state.history.length ? state.history.slice(0,5).map(rowTemplate).join('') : `<div class="track-row"><div class="track-index">—</div><div class="track-cover"></div><div class="track-main"><strong>Здесь появятся недавние треки</strong><span>Начни слушать рекомендации выше</span></div></div>`
  bindTrackActions(els.likesList); bindTrackActions(els.historyList); bindTrackActions(els.recentHome)
}

function toggleLike(track) {
  const idx = state.likes.findIndex(x => x.id === track.id)
  if (idx >= 0) { state.likes.splice(idx,1); toast('Убрано из «Мне нравится»') }
  else { state.likes.unshift(track); toast('Добавлено в «Мне нравится»') }
  saveJSON('mv-music:likes', state.likes)
  renderLibrary()
  updatePlayer()
  const active = $('.active-view')
  if (active?.id === 'exploreView') renderExplore(state.currentSearch || state.queue || [])
}

function addHistory(track) {
  state.history = [track, ...state.history.filter(x => x.id !== track.id)].slice(0, 60)
  saveJSON('mv-music:history', state.history)
  renderLibrary()
}

async function playTrack(track, queue = null) {
  state.current = track
  if (queue?.length) state.queue = queue
  if (!state.queue.some(x => x.id === track.id)) state.queue = [track, ...state.queue]
  state.queueIndex = state.queue.findIndex(x => x.id === track.id)
  updatePlayer()
  addHistory(track)

  audio.src = `/api/play/${encodeURIComponent(track.provider)}/${encodeURIComponent(track.providerId)}`
  try {
    await audio.play()
  } catch (error) {
    toast(error?.message?.includes('play') ? 'Браузер заблокировал автозапуск — нажми Play' : 'Не удалось запустить трек')
  }
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
}

function nextTrack(direction = 1) {
  if (!state.queue.length) return
  if (state.shuffle) state.queueIndex = Math.floor(Math.random() * state.queue.length)
  else state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length
  playTrack(state.queue[state.queueIndex])
}

function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active-view'))
  $(`#${name}View`)?.classList.add('active-view')
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name))
  els.sidebar.classList.remove('open')
  if (name === 'likes' || name === 'history') renderLibrary()
  window.scrollTo({ top:0, behavior:'smooth' })
}

async function doSearch(query) {
  showView('explore')
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

async function load() {
  renderLibrary()
  try {
    state.config = await api('/api/config')
    const enabled = Object.entries(state.config.providers).filter(([,v]) => v.enabled).map(([k]) => providerName(k))
    els.providerSummary.textContent = enabled.join(' + ') || 'не настроены'
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
}

$$('[data-view]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); showView(el.dataset.view) }))
$$('[data-search]').forEach(el => el.addEventListener('click', () => { els.searchInput.value = el.dataset.search; doSearch(el.dataset.search) }))
els.searchForm.addEventListener('submit', e => { e.preventDefault(); const q = els.searchInput.value.trim(); if (q.length >= 2) doSearch(q); else toast('Введите хотя бы 2 символа') })
els.mobileMenu.addEventListener('click', () => els.sidebar.classList.toggle('open'))
$('#heroPlay').addEventListener('click', () => { if (state.queue.length) playTrack(state.queue[0], state.queue); else toast('Каталог ещё загружается') })
els.playerLike.addEventListener('click', () => state.current && toggleLike(state.current))
els.playBtn.addEventListener('click', async () => { if (!state.current && state.queue.length) return playTrack(state.queue[0], state.queue); if (!state.current) return; if (audio.paused) await audio.play().catch(()=>toast('Не удалось запустить')); else audio.pause() })
els.prevBtn.addEventListener('click', () => nextTrack(-1)); els.nextBtn.addEventListener('click', () => nextTrack(1))
els.shuffleBtn.addEventListener('click', () => { state.shuffle = !state.shuffle; els.shuffleBtn.style.color = state.shuffle ? 'var(--accent)' : ''; toast(state.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено') })
els.repeatBtn.addEventListener('click', () => { state.repeat = !state.repeat; audio.loop = state.repeat; els.repeatBtn.style.color = state.repeat ? 'var(--accent)' : ''; toast(state.repeat ? 'Повтор включён' : 'Повтор выключен') })
els.volume.addEventListener('input', () => { audio.volume = Number(els.volume.value) })
audio.volume = Number(els.volume.value)
audio.addEventListener('play', () => els.playBtn.textContent = 'Ⅱ')
audio.addEventListener('pause', () => els.playBtn.textContent = '▶')
audio.addEventListener('loadedmetadata', () => { els.duration.textContent = fmtTime(audio.duration || state.current?.duration) })
audio.addEventListener('timeupdate', () => { const ratio = audio.duration ? audio.currentTime/audio.duration : 0; els.progress.value = String(Math.round(ratio * 1000)); els.currentTime.textContent = fmtTime(audio.currentTime); els.duration.textContent = fmtTime(audio.duration || state.current?.duration) })
audio.addEventListener('ended', () => { if (!state.repeat) nextTrack(1) })
audio.addEventListener('error', () => { if (audio.src) toast('Источник не отдал аудио. Попробуй другой трек.') })
els.progress.addEventListener('input', () => { if (audio.duration) audio.currentTime = Number(els.progress.value)/1000 * audio.duration })

load()
