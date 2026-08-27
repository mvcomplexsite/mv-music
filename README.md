# MV Music

MV Music — музыкальный веб-сервис с единым интерфейсом и provider-layer для нескольких музыкальных каталогов.

Текущая версия подготовлена специально для бесплатного деплоя на **Cloudflare Workers + Static Assets**.

## Что уже работает

- тёмный адаптивный интерфейс MV Music;
- главная / обзор / поиск;
- постоянный нижний аудиоплеер;
- play / pause / next / previous / seek / volume / shuffle / repeat;
- лайки и история прослушиваний (пока в `localStorage` браузера);
- единый формат трека независимо от источника;
- Jamendo provider;
- Audius provider после добавления API credentials;
- API и frontend находятся в одном Cloudflare Worker проекте;
- `/api/play/...` по возможности редиректит браузер к музыкальному CDN, а не проксирует весь аудиофайл через Worker.

## Структура

```text
mv-music/
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src/
│   └── worker.js
├── wrangler.jsonc
├── package.json
├── .dev.vars.example
├── .env.example
├── .gitignore
└── README.md
```

## Cloudflare deploy через GitHub

Репозиторий и Worker должны называться `mv-music`.

1. Загрузите содержимое этой папки в корень GitHub-репозитория `mv-music`.
2. В Cloudflare откройте **Workers & Pages** → **Create application**.
3. В блоке **Import a repository** нажмите **Get started**.
4. Подключите GitHub и выберите репозиторий `mv-music`.
5. Production branch: `main`.
6. Root directory: `/` (или оставьте пустым, если файлы находятся в корне репозитория).
7. Build command: оставить пустым.
8. Deploy command: `npx wrangler deploy`.
9. Имя Worker: `mv-music`.
10. Нажмите **Save and Deploy**.

После успешного деплоя Cloudflare выдаст адрес вида:

```text
https://mv-music.<ваш-workers-subdomain>.workers.dev
```

Каждый последующий push в `main` будет автоматически запускать новый deploy.

## Переменные Cloudflare

В Worker откройте **Settings → Variables & Secrets**.

Можно начать вообще без Audius: Jamendo использует testing read-only client id для разработки.

Для Audius добавьте:

```text
AUDIUS_API_KEY=...
AUDIUS_BEARER_TOKEN=...
```

`AUDIUS_BEARER_TOKEN` храните только как secret и никогда не добавляйте в frontend или GitHub.

Перед публичным запуском добавьте собственный:

```text
JAMENDO_CLIENT_ID=...
```

`MUSIC_PROVIDERS` уже задан в `wrangler.jsonc`:

```text
audius,jamendo
```

## Локальный запуск

Нужен Node.js 20+.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Wrangler покажет локальный адрес, обычно `http://localhost:8787`.

## API

```text
GET /api/health
GET /api/config
GET /api/discover
GET /api/search?q=rock
GET /api/track/jamendo/:id
GET /api/track/audius/:id
GET /api/play/jamendo/:id
GET /api/play/audius/:id
```

## Следующие этапы

- MV Account;
- Cloudflare D1 для аккаунтов, лайков, истории и плейлистов;
- страницы артиста и альбома;
- очередь и MV Mix;
- кэш API;
- YandexProvider как дополнительное подключение аккаунта;
- замена провайдера на партнёрский API без переделки frontend.
