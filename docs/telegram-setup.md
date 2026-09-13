# Connect Telegram

Use this guide after the POS is installed, migrated, and has an administrator.

## 1. Create the bot

In Telegram, open **@BotFather**, send `/newbot`, and keep the token it returns private. The token is the value for `TELEGRAM_BOT_TOKEN`.

Before registering a webhook, have each staff member open a **private** chat with the new bot and send `/start`. Retrieve their Telegram user ID from the queued update:

```sh
set -a
. ./.env
set +a

curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

Find `result[].message.from.id` for each staff member. `getUpdates` only works while no webhook is registered, so collect IDs before step 4. Do not paste the token directly into a command or commit it to source control.

## 2. Configure the POS

Telegram must reach the POS at a public HTTPS URL. Run the app behind an HTTPS reverse proxy with persistent SQLite storage, then set these values in `.env`:

```dotenv
APP_BASE_URL=https://pos.example.com
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=token-from-botfather
TELEGRAM_WEBHOOK_SECRET=paste-a-random-secret-here
```

Generate the webhook secret with `openssl rand -hex 32`. Keep `DATABASE_URL` and `SESSION_SECRET` configured as usual. Build, migrate, and start the service:

```sh
bun run build
bun run db:migrate
bun run start
```

Confirm the public service responds before continuing:

```sh
curl -f "$APP_BASE_URL/health"
```

## 3. Link staff

Sign in as an administrator, open **Settings**, then use **Telegram staff links** to select the POS user and enter that person’s Telegram user ID. Each Telegram account can be linked to only one POS user and must remain active to use the bot.

Create any products and active expense categories needed for the staff workflows.

## 4. Register the webhook

From a trusted shell, load the environment and tell Telegram where to deliver updates:

```sh
set -a
. ./.env
set +a

curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=$APP_BASE_URL/telegram/webhook" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Verify that Telegram accepted it and that `url` matches your POS endpoint:

```sh
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The app verifies the `X-Telegram-Bot-Api-Secret-Token` header on every webhook request. Telegram’s [Bot API](https://core.telegram.org/bots/api#setwebhook) requires an HTTPS webhook and sends that header when `secret_token` is set.

## 5. Test the bot

Each linked staff member should use a private chat with the bot:

- `/sale` starts a guided sale.
- `/expense` starts a guided expense.
- `/cancel` discards the current draft.

The bot rejects unlinked or inactive staff and group chats. If Telegram reports delivery errors in `getWebhookInfo`, check that `APP_BASE_URL` is public HTTPS, the reverse proxy forwards `POST /telegram/webhook`, and the configured webhook secret still matches `.env`.
