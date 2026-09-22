# Nara TelePOS

Bun, Hono, Svelte, Drizzle, SQLite, and an optional Telegram bot for a small POS.

## Install and start

Install Bun, then install dependencies and create local configuration:

```sh
bun install
cp .env.example .env
```

Set these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file path. Keep its directory persistent in production. |
| `SESSION_SECRET` | Long random value for signed sessions, for example `openssl rand -base64 32`. |
| `APP_BASE_URL` | Public base URL; use `http://localhost:3000` for local web-only use and `https://pos.example.com` in production. |
| `PORT` | HTTP listener port (default `3000`). |
| `TELEGRAM_ENABLED` | `false` for web-only use; set to `true` only after the bot token and webhook secret below are configured. |
| `TELEGRAM_BOT_TOKEN` | BotFather token. Required when Telegram is enabled. |
| `TELEGRAM_WEBHOOK_SECRET` | Random webhook secret sent by Telegram as a request header. Required when Telegram is enabled. |

Apply the schema and create the first administrator exactly once:

```sh
bun run db:migrate
bun run bootstrap:admin "Owner Name" owner@example.com "choose-a-strong-password"
```

Run `bun run bootstrap:admin` without arguments to enter the name, email, and password interactively.

The bootstrap command refuses to create a second administrator. Create other staff, products, and expense categories in **Settings** after signing in.

### Demo data

After migrations and bootstrapping an administrator, add sample sales and expenses manually:

```sh
bun run seed:demo
```

The command is never run by `dev` or `start`. Each invocation atomically adds two demo sales and two demo expenses while reusing the demo product, customer, and expense category.

### Local web-only mode

Leave `TELEGRAM_ENABLED=false`, use the localhost `APP_BASE_URL`, then build the client and run the server:

```sh
bun run build
bun run dev
```

Open `http://localhost:3000/pos`. `bun run dev` restarts the Bun server when server code changes; rerun `bun run build` after client changes. For a production-style local run, use `bun run start` after building.

## Production and Telegram

See [the Telegram setup guide](docs/telegram-setup.md) to create a bot, link staff, and register its webhook.

Run the application behind an HTTPS reverse proxy, with the SQLite database on persistent storage:

```sh
bun run build
bun run db:migrate
bun run start
```

Check the running service with `curl -f https://pos.example.com/health`.

Telegram webhooks require a publicly reachable HTTPS URL. Set `APP_BASE_URL=https://pos.example.com`, `TELEGRAM_ENABLED=true`, the BotFather token, and a long random `TELEGRAM_WEBHOOK_SECRET`; then register the webhook with Telegram:

```sh
# In a trusted shell, export the values documented in .env for this command.
set -a
. ./.env
set +a

curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=$APP_BASE_URL/telegram/webhook" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Confirm registration with `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"`. In **Settings**, link each active staff member’s Telegram user ID before they can use the bot. Do not expose the bot token or webhook secret in source control or shell history.

## Manual smoke test

Use a disposable local database for this check.

1. Sign in as the first admin. In **Settings**, create an active expense category and a product with stock (for example, Coffee, price `15000`, stock `2`).
2. In **POS**, add one Coffee, choose a payment method, and complete the sale. Confirm the receipt and that the sale appears in **Sales**.
3. As the admin, cancel that sale from **Sales** with a reason. Confirm it is marked cancelled and Coffee stock returns to `2`.
4. In **Expenses**, record an expense using the category. Confirm it appears in expense history and Coffee stock is unchanged.

Run the automated checks before deployment:

```sh
bun run build && bun test && bun run db:migrate
```
