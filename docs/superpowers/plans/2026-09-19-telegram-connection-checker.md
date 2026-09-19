# Telegram Connection Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only Settings button that checks the configured Telegram bot token with Telegram’s `getMe` API.

**Architecture:** Extend the existing Telegram client module with a token-safe `checkTelegramBot` helper. Inject that checker into the existing Settings routes, expose `POST /api/settings/telegram/check`, and add a small stateful button to the existing Telegram staff-links card.

**Tech Stack:** Bun, Hono, Svelte 5, Telegram Bot API, shadcn-svelte, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-19-telegram-connection-checker-design.md`

## Global Constraints

- The feature lives in Settings → Team → Telegram staff links.
- Only administrators may invoke the endpoint; anonymous and cashier requests are denied.
- Success is exactly `{ ok: true }`; never return the bot token.
- Network/API failures map to `502 TELEGRAM_UNAVAILABLE`; missing configuration maps to `503 TELEGRAM_NOT_CONFIGURED`.
- No webhook changes, chat messages, migrations, or new dependencies.

### Task 1: Add the Telegram checker and protected route

**Files:**
- Modify: `src/server/telegram/client.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/routes/settings.ts`
- Test: `tests/telegram-checker.test.ts`

**Interfaces:**
- Produce `checkTelegramBot(token: string, fetcher?: typeof fetch): Promise<void>`; resolve only when Telegram returns HTTP success and JSON `{ ok: true }`, otherwise reject with a token-safe error.
- Produce `POST /api/settings/telegram/check` with the response contract in the spec.
- Consume `AppOptions.telegramBotToken` and an injectable `telegramChecker?: () => Promise<void>` for tests.

- [ ] **Step 1: Write failing route and checker tests**

Create a test database with admin and cashier users. Cover:

```ts
test('admin can verify a configured Telegram bot', async () => {
  const { adminRequest } = await setup({ telegramChecker: async () => {} })
  const response = await adminRequest('/api/settings/telegram/check', { method: 'POST' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test('checker is restricted and maps missing or failed configuration', async () => {
  const configured = await setup({ telegramChecker: async () => { throw new Error('Telegram check failed') } })
  expect((await configured.cashierRequest('/api/settings/telegram/check', { method: 'POST' })).status).toBe(403)
  expect((await configured.app.request('/api/settings/telegram/check', { method: 'POST' })).status).toBe(401)
  expect((await configured.adminRequest('/api/settings/telegram/check', { method: 'POST' })).status).toBe(502)

  const missing = await setup()
  expect((await missing.adminRequest('/api/settings/telegram/check', { method: 'POST' })).status).toBe(503)
})
```

Also test `checkTelegramBot` with a fake fetcher returning `{ ok: true }`, `{ ok: false }`, and a rejected request. The helper must not include the token in its thrown message.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `bun test tests/telegram-checker.test.ts`

Expected: FAIL because the checker helper and route do not exist.

- [ ] **Step 3: Implement the helper and route**

Implement `checkTelegramBot` with `fetcher('https://api.telegram.org/bot${token}/getMe', { signal: AbortSignal.timeout(10_000) })`, parse the JSON response, and throw `new Error('Telegram check failed')` for HTTP, API, JSON, or network failures. Pass an optional checker through `createApp`; production wiring calls the helper only when `telegramBotToken` is configured. Add `app.post('/telegram/check', ...)` inside `createSettingsRoutes`, returning `503`, `502`, or `{ ok: true }` as specified.

- [ ] **Step 4: Run focused and full tests**

Run: `bun test tests/telegram-checker.test.ts && bun test`

Expected: all checker and existing tests pass.

- [ ] **Step 5: Commit the server change**

```sh
git add src/server/telegram/client.ts src/server/app.ts src/server/routes/settings.ts tests/telegram-checker.test.ts
git commit -m "feat: add Telegram connection checker API"
```

### Task 2: Add the Settings checker button

**Files:**
- Modify: `src/client/routes/Settings.svelte`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consume `POST /api/settings/telegram/check` from Task 1.
- Produce a disabled pending button, success message, and failure message inside the Telegram staff-links card.

- [ ] **Step 1: Write the failing client test**

Add a source/handler test that asserts the Settings route contains the checker request and the `Checking…`/`Telegram connection OK` states. Exercise the handler with a pending API promise, verify only one request is sent while pending, then resolve it and verify success state; reject it and verify the error state.

- [ ] **Step 2: Run the focused client test and confirm it fails**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because the checker handler and button do not exist.

- [ ] **Step 3: Implement the button**

Add `telegramChecking` and `checkTelegram()` to `Settings.svelte`. Call `api<{ ok: true }>('/api/settings/telegram/check', { method: 'POST' })`, guard duplicate clicks, set the existing `message` to `Telegram connection OK`, set the existing `error` on failure, and release the guard in `finally`. Render the button in the Telegram card with `disabled={telegramChecking}` and the pending label.

- [ ] **Step 4: Run client tests and build**

Run: `bun test tests/client-ui.test.ts && bun run build`

Expected: client tests pass and Vite builds successfully.

- [ ] **Step 5: Commit the UI change**

```sh
git add src/client/routes/Settings.svelte tests/client-ui.test.ts
git commit -m "feat: add Telegram checker button"
```

### Task 3: Final verification

**Files:**
- Modify: none unless verification exposes a defect.

- [ ] **Step 1: Run the complete verification set**

Run: `bun test && bun run build && bun run db:migrate && git diff --check`

Expected: all tests pass, the build succeeds, migrations complete, and the diff is clean.

- [ ] **Step 2: Review the final behavior against the spec**

Confirm the button is inside the Telegram staff-links card, only admins can invoke the route, the token is absent from responses/errors, success is `{ ok: true }`, and upstream/configuration failures use the required statuses.
