# MV Music

MV Music — музыкальный веб-сервис на Cloudflare Workers + Static Assets. Каталог подключается через независимый provider layer: сейчас Jamendo работает без дополнительных секретов для тестовой сборки, Audius включается после добавления API credentials.

## Что есть в текущей версии

- главная и каталог;
- поиск треков;
- постоянный аудиоплеер;
- очередь, shuffle, repeat, Media Session;
- страницы трека;
- страницы Jamendo-исполнителей и альбомов;
- лайки и история в localStorage;
- локальные плейлисты: создание, добавление и удаление треков;
- адаптивный интерфейс;
- Cloudflare Worker API и Static Assets в одном deploy.

## Развёртывание

Репозиторий должен называться `mv-music`. Cloudflare Workers Builds может быть подключён к ветке `main`.

Deploy command:

```bash
npx wrangler deploy
```

Build command не требуется.

После каждого commit/push в `main` Cloudflare автоматически пересоберёт Worker.

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/discover`
- `GET /api/search?q=rock`
- `GET /api/track/:provider/:id`
- `GET /api/artist/:provider/:id`
- `GET /api/album/:provider/:id`
- `GET /api/play/:provider/:id`

## Переменные Cloudflare

Необязательно для Jamendo test mode:

- `JAMENDO_CLIENT_ID`

Для Audius:

- `AUDIUS_API_KEY`
- `AUDIUS_BEARER_TOKEN`

Секреты не добавлять в GitHub.

## Следующие этапы

- Cloudflare D1;
- MV Account;
- серверная библиотека, история и плейлисты;
- Audius;
- подключаемые внешние аккаунты и партнёрские provider API.
