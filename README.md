# Codex Usage Dashboard

Локальный web app для мониторинга ChatGPT/Codex subscription аккаунтов.

Что умеет:
- хранить произвольное количество OAuth-профилей (динамические слоты)
- логинить каждый аккаунт через ChatGPT OAuth
- обновлять access token через refresh token
- запрашивать usage из `https://chatgpt.com/backend-api/wham/usage`
- показывать лимиты по всем аккаунтам в одной таблице

## Запуск

```bash
npm start
```

Или с параметрами:

```bash
PORT=1455 BASE_URL=https://codex.example.com npm start
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `1455` | Порт сервера |
| `HOST` | `127.0.0.1` | Адрес для прослушивания |
| `BASE_URL` | `http://localhost:$PORT` | Публичный URL (для OAuth redirect) |
| `OPENAI_PROXY` | _(не задан)_ | HTTP-прокси для запросов к OpenAI |

### Доступ через домен

Если приложение за реверс-прокси (Caddy/nginx), задайте `BASE_URL` чтобы OAuth callback шёл на правильный адрес:

```bash
BASE_URL=https://codex.old.dedyn.io npm start
```

## Важно

- Токены хранятся локально в `data/accounts.json`.
- Файл с токенами добавлен в `.gitignore`.
- Прокси используется только если задан `OPENAI_PROXY`.

## Структура

- `server.mjs` — backend + OAuth callback + API
- `public/` — web UI
- `data/accounts.json` — локальное хранилище профилей
