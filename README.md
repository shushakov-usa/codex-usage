# Codex Usage Dashboard

Локальный web app для 3 независимых ChatGPT/Codex subscription аккаунтов.

Что умеет:
- хранить 3 отдельных OAuth-профиля (`slot1`, `slot2`, `slot3`)
- логинить каждый аккаунт через ChatGPT OAuth
- обновлять access token через refresh token
- запрашивать usage из `https://chatgpt.com/backend-api/wham/usage`
- показывать лимиты по всем трём аккаунтам в одной таблице

## Запуск

```bash
cd /home/old/.openclaw/workspace/codex-usage-dashboard
npm start
```

Потом открыть:

- <http://127.0.0.1:1455>

## Важно

- Приложение слушает порт `1455`, потому что OAuth redirect URI у Codex жёстко завязан на `http://localhost:1455/auth/callback`.
- Токены хранятся локально в `data/accounts.json`.
- Файл с токенами добавлен в `.gitignore`.
- Для OpenAI OAuth/token/usage запросов приложение по умолчанию использует прокси `http://localhost:7890`.
- При необходимости можно переопределить через `OPENAI_PROXY=http://host:port npm start`.

## Структура

- `server.mjs` — backend + OAuth callback + API
- `public/` — web UI
- `data/accounts.json` — локальное хранилище профилей
