# Telegram Connection Checker Design

## Goal

Give administrators a one-click way to verify that the configured Telegram bot token is accepted by Telegram.

## Scope

Add a **Check connection** button inside the existing Settings → Team → Telegram staff links card. The button calls an admin-only server endpoint, performs Telegram Bot API `getMe`, and displays a short success or error message. It does not send a chat message, change the webhook, or inspect staff links.

## API contract

`POST /api/settings/telegram/check` is protected by the existing settings administrator guard.

- Success: `200 { "ok": true }`.
- Missing configured bot token/checker: `503 { "error": "TELEGRAM_NOT_CONFIGURED" }`.
- Telegram rejects the token or the network request fails: `502 { "error": "TELEGRAM_UNAVAILABLE" }`.

The Telegram client helper owns the Bot API URL, timeout, response parsing, and token-safe error handling. The route receives an injectable checker so tests do not call the network.

## UI behavior

The button is rendered in the Telegram staff-links card. While checking it is disabled and reads `Checking…`; on success it shows `Telegram connection OK`; on failure it shows the existing destructive alert with a readable error. Repeated clicks after completion are allowed.

## Authorization and safety

The existing `/api/settings/*` middleware and `createSettingsRoutes` guard keep the endpoint admin-only. The bot token never appears in the response or UI. No database migration or dependency is needed.

## Verification

Add route tests for successful checker calls, unconfigured Telegram, upstream failure, and cashier/anonymous denial. Add a client source/handler test for the button's request, pending guard, success message, and failure message. Run the focused tests, full suite, build, migration, and diff check.
