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
PORT=1455 npm start
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `1455` | Порт сервера |
| `HOST` | `127.0.0.1` | Адрес для прослушивания |
| `OPENAI_PROXY` | _(не задан)_ | HTTP-прокси для запросов к OpenAI (приоритетный) |
| `https_proxy` / `http_proxy` | _(не задан)_ | Стандартные env-прокси (используются если `OPENAI_PROXY` не задан) |

### Прокси

Запросы к OpenAI API (`auth.openai.com`, `chatgpt.com`) идут через прокси.
Приоритет: `OPENAI_PROXY` → `https_proxy` → `http_proxy`.

Используется `undici.fetch` с `ProxyAgent` (глобальный `fetch` в Node 25 не поддерживает
сторонние dispatcher'ы из-за конфликта версий undici).

## OAuth и доступ через домен

OAuth redirect URI привязан к `http://localhost:$PORT/auth/callback` (ограничение Codex OAuth client).

Если дашборд работает на сервере за доменом, авторизация через localhost не попадёт обратно
в браузер. В этом случае используйте ручную вставку callback URL: после OAuth авторизации
скопируйте URL из адресной строки браузера и вставьте в поле на странице дашборда.

## Важно

- Токены хранятся локально в `data/accounts.json`.
- Файл с токенами добавлен в `.gitignore`.

## Структура

- `server.mjs` — backend + OAuth callback + API
- `public/` — web UI
- `data/accounts.json` — локальное хранилище профилей
