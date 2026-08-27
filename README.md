# MV Music

Первый рабочий прототип MV Music: собственный интерфейс + provider layer для нескольких музыкальных каталогов.

## Что уже есть

- тёмный адаптивный UI в музыкальной стилистике MV Music;
- главная / обзор / поиск;
- карточки и список треков;
- постоянный нижний аудиоплеер;
- play / pause / next / previous / seek / volume / shuffle / repeat;
- лайки и история прослушиваний (пока `localStorage`);
- единый формат трека независимо от источника;
- Jamendo provider (работает через read API и возвращаемый `audio` stream URL);
- Audius provider (search / trending / track / stream) после добавления ключей;
- backend не проксирует весь аудиотрафик: `/api/play/...` редиректит браузер к источнику;
- Dockerfile для облачного деплоя;
- никаких npm dependencies — достаточно Node.js 20+.

## Запуск

```bash
cp .env.example .env
npm start
```

Откройте `http://localhost:8787`.

Без `.env` приложение тоже запускается. Для Jamendo используется их тестовый read-only `client_id=709fa152`, который предназначен только для быстрых тестов. Перед публичным запуском создайте собственный Jamendo client id.

## Подключить Audius

Создайте приложение/API credentials в Audius и заполните:

```env
AUDIUS_API_KEY=...
AUDIUS_BEARER_TOKEN=...
```

Bearer остаётся только на backend. Не переносите его в `public/app.js`.

После рестарта `/api/discover` и `/api/search` начнут агрегировать результаты Audius + Jamendo.

## Архитектура

```text
Browser / MV Player
        |
        v
    MV Music API
        |
   Provider layer
    /        \
 Audius    Jamendo
```

В frontend каждый трек имеет единый вид:

```json
{
  "id": "jamendo:1848357",
  "provider": "jamendo",
  "providerId": "1848357",
  "title": "...",
  "artist": "...",
  "artwork": "...",
  "duration": 272
}
```

Поэтому будущий `YandexProvider` или партнёрский API добавляется с той же схемой без переписывания плеера и библиотеки.

## Что делать следующим этапом

1. MV Account + PostgreSQL/Supabase для пользователей.
2. Перенести likes/history/playlists из localStorage в backend.
3. Страницы артиста и альбома.
4. Очередь и умный MV Mix.
5. Кэш поиска/метаданных.
6. YandexProvider как дополнительная привязка аккаунта.
7. Админка источников и health monitoring.

## Cloud deploy

Проект слушает `PORT` и подходит для Render/Railway/Fly.io/Cloud Run или любого Docker-хостинга.

Для production обязательно задайте собственные `JAMENDO_CLIENT_ID`, `AUDIUS_API_KEY` и `AUDIUS_BEARER_TOKEN` через secrets/environment variables платформы.
