# Nara TelePOS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a general-purpose web and Telegram POS that records completed sales and non-inventory expenses reliably in SQLite.

**Architecture:** A single Bun/Hono process serves the Svelte SPA and JSON API. Drizzle and Bun SQLite persist data; shared sale and expense services own all transactional business writes. The Telegram webhook persists update claims and per-user drafts, then calls the same services as the web application.

**Tech Stack:** Bun, Hono, Svelte, Vite, Drizzle ORM, SQLite (`bun:sqlite`), Telegram Bot API, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-05-nara-telepos-design.md`

## Global Constraints

- Use one Bun process, Svelte SPA, Hono API, Drizzle, and SQLite; do not add SvelteKit, a Telegram SDK, a queue, or another service.
- Store money as integer IDR and quantities as positive integers; calculate prices and totals only on the server.
- Route completed sales only through `createCompletedSale(input, actor)` and expenses only through `createExpense(input, actor)`.
- Direct Telegram chats from an active administrator-created staff link are the only supported bot channel.
- Reversal is admin-only, requires a reason, creates compensating stock movements, and never deletes a sale.
- Master data and configuration are managed only in the web app. Telegram may create customers but never categories or settings.
- Keep product purchases, stock intake, discounts, taxes, reports, PDFs, credit, and partial payments out of the MVP.
- All commit and test commands must be run from this repository with Bun; do not rely on the parent home-directory Git repository.

---

## Planned file structure

| Path | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts` | Build, test, migration, and development commands. |
| `src/server/config.ts` | Validated environment configuration. |
| `src/server/db/schema.ts`, `src/server/db/index.ts`, `drizzle/` | SQLite schema, connection, and generated SQL migrations. |
| `src/server/domain/types.ts`, `src/server/domain/errors.ts` | Shared actor/input/output types and API-safe domain errors. |
| `src/server/services/sales.ts`, `src/server/services/expenses.ts` | Atomic business transaction boundaries. |
| `src/server/services/catalog.ts`, `src/server/services/staff.ts` | Web-managed master data and Telegram authorization queries. |
| `src/server/auth.ts`, `src/server/routes/*.ts`, `src/server/app.ts` | Session authentication, RBAC middleware, HTTP routes, and Hono assembly. |
| `src/server/telegram/*.ts` | Telegram API client, update verification/deduplication, draft state machine, and webhook route. |
| `src/client/main.ts`, `src/client/App.svelte`, `src/client/lib/api.ts` | Svelte entrypoint, authenticated app shell, and API client. |
| `src/client/routes/*.svelte`, `src/client/components/*.svelte` | Login, POS, master data, settings, history, and expense UI. |
| `tests/**/*.test.ts` | Domain, route, and Telegram tests using Bun test and a disposable SQLite database. |
| `.env.example`, `README.md` | Required configuration and local/production Telegram setup. |

### Task 1: Bootstrap the single-service project and database

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `drizzle.config.ts`
- Create: `src/server/config.ts`
- Create: `src/server/db/index.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/domain/types.ts`
- Create: `src/server/domain/errors.ts`
- Create: `tests/helpers/database.ts`
- Create: `tests/config.test.ts`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces: `loadConfig(env: Record<string, string | undefined>): AppConfig`.
- Produces: `createDatabase(filename: string): DatabaseClient`, `schema`, `Actor`, `SaleInput`, `ExpenseInput`, and `DomainError` for all later tasks.
- Consumes: nothing.

- [ ] **Step 1: Write the failing configuration test**

```ts
import { expect, test } from 'bun:test'
import { loadConfig } from '../src/server/config'

test('requires session and Telegram secrets when Telegram is enabled', () => {
  expect(() => loadConfig({ DATABASE_URL: ':memory:', APP_BASE_URL: 'http://localhost:3000' }))
    .toThrow('SESSION_SECRET is required')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/config.test.ts`

Expected: FAIL because `src/server/config.ts` does not exist.

- [ ] **Step 3: Add only the project dependencies and scripts**

```json
{
  "scripts": {
    "dev": "bun --watch src/server/index.ts",
    "build": "vite build",
    "start": "bun src/server/index.ts",
    "test": "bun test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

Install `hono`, `drizzle-orm`, `svelte`, and the build-time `drizzle-kit`, `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, and `@types/bun`. Use `bun:sqlite`; do not install a SQLite or Telegram package.

- [ ] **Step 4: Implement config, shared types, and schema**

`loadConfig` must require `DATABASE_URL`, `SESSION_SECRET`, and `APP_BASE_URL`; require `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` only when `TELEGRAM_ENABLED=true`. Define tables exactly from the spec: users, products, customers, sales, sale_items, stock_movements, expense_categories, expenses, telegram_staff, telegram_updates, and telegram_conversations. Add unique constraints for emails, SKU, non-null barcodes, invoice/expense numbers, Telegram staff user/Telegram IDs, and Telegram `update_id`.

```ts
export type Actor = { id: number; role: 'admin' | 'cashier' }
export type SaleInput = {
  customerId?: number
  paymentMethod: 'cash' | 'transfer' | 'qris'
  items: Array<{ productId: number; quantity: number }>
  source: 'web' | 'telegram'
}
export type ExpenseInput = {
  expenseCategoryId: number
  amount: number
  transactionDate: string
  notes?: string
  source: 'web' | 'telegram'
}
```

- [ ] **Step 5: Generate and run the initial migration, then pass the test**

Run: `bun run db:generate && bun run db:migrate && bun test tests/config.test.ts`

Expected: migration SQL exists under `drizzle/`; the config test passes.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock tsconfig.json vite.config.ts drizzle.config.ts src/server tests drizzle .env.example .gitignore
git commit -m "chore: bootstrap Bun POS service"
```

### Task 2: Add session authentication and role enforcement

**Files:**
- Create: `src/server/auth.ts`
- Create: `src/server/routes/auth.ts`
- Create: `src/server/app.ts`
- Create: `tests/auth.test.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/domain/errors.ts`

**Interfaces:**
- Consumes: `Actor`, `DatabaseClient`, `users` from Task 1.
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`, `requireActor(c: Context): Actor`, and `requireRole(...roles: Actor['role'][]): MiddlewareHandler`.

- [ ] **Step 1: Write failing authentication and authorization tests**

```ts
test('logs in with a valid password and rejects a cashier admin request', async () => {
  const login = await app.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'cashier@example.test', password: 'secret123' }) })
  expect(login.status).toBe(204)
  expect((await app.request('/api/settings/users', { headers: { cookie: login.headers.get('set-cookie')! } })).status).toBe(403)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/auth.test.ts`

Expected: FAIL because auth routes and middleware do not exist.

- [ ] **Step 3: Implement minimal signed-cookie authentication**

Use Bun password hashing and `crypto.subtle`/Hono signed cookies; do not add an auth library. Login creates a signed, HTTP-only, same-site session cookie containing the user ID. Route middleware loads the user, attaches the `Actor`, returns 401 when absent, and returns 403 on a wrong role. Add logout and a bootstrap-only CLI/script path that creates the first admin before the normal user-management UI exists.

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/auth.test.ts`

Expected: PASS for valid login, invalid credentials, unauthenticated request, and role rejection.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth.ts src/server/routes/auth.ts src/server/app.ts src/server/db/schema.ts src/server/domain/errors.ts tests/auth.test.ts
git commit -m "feat: add POS authentication and roles"
```

### Task 3: Implement web-managed master data and staff links

**Files:**
- Create: `src/server/services/catalog.ts`
- Create: `src/server/services/staff.ts`
- Create: `src/server/routes/products.ts`
- Create: `src/server/routes/customers.ts`
- Create: `src/server/routes/settings.ts`
- Create: `tests/catalog.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: `Actor`, `DatabaseClient`, auth middleware, and schema from Tasks 1–2.
- Produces: `findSaleableProducts(query: string): ProductSummary[]`, `createCustomer(input, actor): Customer`, `findActiveTelegramStaff(telegramUserId: string): Actor | null`, and admin-only CRUD routes for products, categories, users, Telegram staff, and store profile.

- [ ] **Step 1: Write failing master-data tests**

```ts
test('only an admin can adjust stock and a cashier can create a customer', async () => {
  expect((await cashierRequest('/api/products/1/stock-adjustments', { method: 'POST', body: JSON.stringify({ quantityDelta: 5, reason: 'count' }) })).status).toBe(403)
  expect((await cashierRequest('/api/customers', { method: 'POST', body: JSON.stringify({ name: 'Maya' }) })).status).toBe(201)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/catalog.test.ts`

Expected: FAIL because the master-data services/routes do not exist.

- [ ] **Step 3: Implement the smallest web-only master-data surface**

Implement product CRUD, active/inactive state, and admin stock adjustment that appends an `adjustment` stock movement in the same transaction. Implement customer create/search/edit. Implement active/inactive expense-category CRUD. Implement admin user creation/role assignment, active Telegram user-ID link/unlink, and a one-row store profile (name and receipt footer). Ensure Telegram callers can only read products/categories and create customers through later bot code; they never invoke settings routes.

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/catalog.test.ts`

Expected: PASS for role boundaries, stock movement creation, inactive-category exclusion, and unique Telegram link enforcement.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/catalog.ts src/server/services/staff.ts src/server/routes/products.ts src/server/routes/customers.ts src/server/routes/settings.ts src/server/app.ts tests/catalog.test.ts
git commit -m "feat: add POS master data"
```

### Task 4: Build the shared sale transaction and cancellation

**Files:**
- Create: `src/server/services/sales.ts`
- Create: `tests/sales.test.ts`
- Modify: `src/server/domain/errors.ts`

**Interfaces:**
- Consumes: `SaleInput`, `Actor`, product/customer/sales/stock schema from Tasks 1 and 3.
- Produces: `createCompletedSale(db: DatabaseClient, input: SaleInput, actor: Actor): Promise<SaleReceipt>` and `cancelSale(db: DatabaseClient, saleId: number, reason: string, actor: Actor): Promise<void>`.

- [ ] **Step 1: Write failing sale behavior tests**

```ts
test('creates snapshots and stock movements atomically', async () => {
  const receipt = await createCompletedSale(db, { source: 'web', paymentMethod: 'cash', items: [{ productId, quantity: 2 }] }, cashier)
  expect(receipt.totalAmount).toBe(30000)
  expect(await productStock(productId)).toBe(3)
  expect(await stockMovementCount(productId, 'sale')).toBe(1)
})

test('rejects insufficient stock without partial writes', async () => {
  await expect(createCompletedSale(db, { source: 'web', paymentMethod: 'cash', items: [{ productId, quantity: 6 }] }, cashier)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  expect(await productStock(productId)).toBe(5)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/sales.test.ts`

Expected: FAIL because `createCompletedSale` does not exist.

- [ ] **Step 3: Implement the sale transaction**

Within one SQLite transaction, validate the actor, nonempty unique product lines, integer positive quantities, permitted payment method, optional customer, active products, and current stock. Reload each product and use its persisted `salePrice`; never trust a browser/bot price or total. Generate a unique invoice number, insert sale and snapshot items, update each product, then write matching `sale` movements. Return `SaleReceipt` with invoice, lines, total, payment method, customer, source, and sale ID.

```ts
export type SaleReceipt = {
  id: number; invoiceNumber: string; totalAmount: number
  paymentMethod: SaleInput['paymentMethod']
  lines: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }>
}
```

- [ ] **Step 4: Add cancellation tests and implementation**

```ts
test('an admin cancellation restores stock exactly once', async () => {
  await cancelSale(db, sale.id, 'Customer changed mind', admin)
  expect(await productStock(productId)).toBe(5)
  await expect(cancelSale(db, sale.id, 'again', admin)).rejects.toMatchObject({ code: 'SALE_ALREADY_CANCELLED' })
})
```

`cancelSale` must allow only admins, require a nonblank reason, mark rather than delete the sale, restore every sale-item quantity, and append `sale_cancellation` movements atomically.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/sales.test.ts`

Expected: PASS for totals, snapshots, current-price authority, rollback, role control, cancellation, and a second-cancel rejection.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/sales.ts src/server/domain/errors.ts tests/sales.test.ts
git commit -m "feat: add atomic sales and cancellations"
```

### Task 5: Build the shared expense transaction

**Files:**
- Create: `src/server/services/expenses.ts`
- Create: `tests/expenses.test.ts`
- Modify: `src/server/domain/types.ts`

**Interfaces:**
- Consumes: `ExpenseInput`, `Actor`, `expense_categories`, `expenses` from Tasks 1 and 3.
- Produces: `createExpense(db: DatabaseClient, input: ExpenseInput, actor: Actor): Promise<ExpenseReceipt>`.

- [ ] **Step 1: Write the failing expense tests**

```ts
test('records a non-inventory expense', async () => {
  const receipt = await createExpense(db, { expenseCategoryId, amount: 25000, transactionDate: '2026-09-05', source: 'web', notes: 'courier' }, cashier)
  expect(receipt.amount).toBe(25000)
  expect(await productStock(productId)).toBe(5)
})

test('rejects an inactive category', async () => {
  await expect(createExpense(db, { expenseCategoryId: inactiveId, amount: 1, transactionDate: '2026-09-05', source: 'web' }, cashier)).rejects.toMatchObject({ code: 'EXPENSE_CATEGORY_INACTIVE' })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/expenses.test.ts`

Expected: FAIL because `createExpense` does not exist.

- [ ] **Step 3: Implement the smallest expense transaction**

Validate a positive integer amount, ISO date, optional bounded note, actor, and active category; generate a unique expense number and insert once in a transaction. Do not query or mutate products/stock movements.

```ts
export type ExpenseReceipt = { id: number; expenseNumber: string; amount: number; categoryName: string; transactionDate: string }
```

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/expenses.test.ts`

Expected: PASS for valid expense, inactive category, invalid amount/date, and no stock mutation.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/expenses.ts src/server/domain/types.ts tests/expenses.test.ts
git commit -m "feat: add non-inventory expenses"
```

### Task 6: Expose protected Hono APIs for the web POS

**Files:**
- Create: `src/server/routes/sales.ts`
- Create: `src/server/routes/expenses.ts`
- Modify: `src/server/app.ts`
- Create: `tests/routes.test.ts`

**Interfaces:**
- Consumes: auth middleware, catalog/staff services, `createCompletedSale`, `cancelSale`, and `createExpense` from Tasks 2–5.
- Produces: authenticated `/api/products`, `/api/customers`, `/api/sales`, `/api/expenses`, and `/api/settings/*` JSON routes.

- [ ] **Step 1: Write route integration tests**

```ts
test('sale route ignores client total and uses the shared transaction', async () => {
  const response = await cashierRequest('/api/sales', { method: 'POST', body: JSON.stringify({ items: [{ productId, quantity: 1 }], paymentMethod: 'qris', totalAmount: 1 }) })
  expect(response.status).toBe(201)
  expect((await response.json()).totalAmount).toBe(15000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/routes.test.ts`

Expected: FAIL because sales and expense routes do not exist.

- [ ] **Step 3: Implement route adapters only**

Parse and validate JSON at the HTTP boundary, call the shared services, serialize receipts/history/detail, and map `DomainError` codes to 400/401/403/404/409/422. The create-sale route must accept only product IDs, quantities, customer ID, and payment method; discard client totals/prices. Add admin-only cancellation and owner-scoped history/details for cashiers. Add create/list/detail expenses with the same ownership rule.

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/routes.test.ts`

Expected: PASS for role boundaries, client-total rejection, owner scope, validation errors, and cancellation.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/sales.ts src/server/routes/expenses.ts src/server/app.ts tests/routes.test.ts
git commit -m "feat: expose POS HTTP API"
```

### Task 7: Implement the minimal Svelte web application

**Files:**
- Create: `src/client/main.ts`
- Create: `src/client/App.svelte`
- Create: `src/client/lib/api.ts`
- Create: `src/client/routes/Login.svelte`
- Create: `src/client/routes/Pos.svelte`
- Create: `src/client/routes/Sales.svelte`
- Create: `src/client/routes/Expenses.svelte`
- Create: `src/client/routes/Settings.svelte`
- Create: `src/client/components/Cart.svelte`
- Create: `src/client/components/CustomerForm.svelte`
- Create: `src/client/app.css`
- Create: `tests/client-api.test.ts`

**Interfaces:**
- Consumes: JSON API responses from Task 6.
- Produces: a responsive same-origin web interface for cashier and admin flows; `api<T>(path: string, init?: RequestInit): Promise<T>`.

- [ ] **Step 1: Write a failing client API test**

```ts
test('api turns a structured API failure into a readable Error', async () => {
  mockFetch(422, { code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock' })
  await expect(api('/api/sales', { method: 'POST' })).rejects.toThrow('Insufficient stock')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/client-api.test.ts`

Expected: FAIL because the client API module does not exist.

- [ ] **Step 3: Implement the Svelte UI without an extra UI library**

Use native form controls and CSS. Build login; POS search/cart/quantity/customer selection-or-creation/payment/confirm/receipt; sale history/detail and admin cancellation; expense create/history/detail; and an admin settings area for products, stock adjustments, customers, expense categories, users/Telegram links, and store profile. Use role data from `/api/auth/me` to hide unavailable actions, but rely on API enforcement for security. Keep routing in `App.svelte` with simple path selection; do not add a router dependency.

- [ ] **Step 4: Run focused test and production build**

Run: `bun test tests/client-api.test.ts && bun run build`

Expected: test PASS and a built client bundle.

- [ ] **Step 5: Commit**

```bash
git add src/client tests/client-api.test.ts vite.config.ts src/server/app.ts
git commit -m "feat: add Svelte POS interface"
```

### Task 8: Add Telegram transport, webhook security, and draft persistence

**Files:**
- Create: `src/server/telegram/client.ts`
- Create: `src/server/telegram/update.ts`
- Create: `src/server/telegram/conversations.ts`
- Create: `src/server/routes/telegram.ts`
- Create: `tests/telegram-webhook.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: config, `findActiveTelegramStaff`, Telegram schema, and `Actor` from Tasks 1–3.
- Produces: `TelegramClient`, `claimUpdate(updateId: number): Promise<boolean>`, `loadConversation(telegramUserId: string): Conversation | null`, and public `POST /telegram/webhook`.

- [ ] **Step 1: Write failing webhook tests**

```ts
test('rejects a bad secret and ignores a duplicate update', async () => {
  expect((await app.request('/telegram/webhook', { method: 'POST', body: JSON.stringify(update), headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' } })).status).toBe(403)
  await validWebhook(update)
  expect(await validWebhook(update)).toHaveStatus(200)
  expect(sentMessages).toHaveLength(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/telegram-webhook.test.ts`

Expected: FAIL because the webhook is absent.

- [ ] **Step 3: Implement safe Telegram primitives**

Use `fetch` against `https://api.telegram.org/bot${token}/sendMessage`; keep a small interface so tests can inject a fake client. Verify the exact webhook secret before parsing. Claim `update_id` with the table primary key; duplicate claims return 200 without dispatching a message or write. Accept only private chats and active staff links. Persist a JSON draft with named state, chat ID, expiry, and updated timestamp. Expired drafts are discarded before processing the new action.

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/telegram-webhook.test.ts`

Expected: PASS for bad secret, unknown/inactive/group user, duplicate update, and expiry behavior.

- [ ] **Step 5: Commit**

```bash
git add src/server/telegram src/server/routes/telegram.ts src/server/app.ts tests/telegram-webhook.test.ts
git commit -m "feat: secure Telegram webhook foundation"
```

### Task 9: Add the Telegram sale conversation

**Files:**
- Modify: `src/server/telegram/conversations.ts`
- Create: `src/server/telegram/sale-flow.ts`
- Create: `tests/telegram-sales.test.ts`

**Interfaces:**
- Consumes: `TelegramClient`, persisted conversations, catalog queries, `createCustomer`, and `createCompletedSale` from Tasks 3, 4, and 8.
- Produces: `handleTelegramSale(input: TelegramInboundMessage, actor: Actor): Promise<void>` and the sale states `sale.customer`, `sale.customerCreate`, `sale.productSearch`, `sale.quantity`, `sale.payment`, `sale.confirm`.

- [ ] **Step 1: Write a failing end-to-end conversation test**

```ts
test('confirmed Telegram sale creates one shared sale and sends a receipt', async () => {
  await telegramText('/sale')
  await telegramCallback('sale:customer:none')
  await telegramText('coffee')
  await telegramCallback(`sale:product:${productId}`)
  await telegramText('2')
  await telegramCallback('sale:items:done')
  await telegramCallback('sale:payment:qris')
  await telegramCallback('sale:confirm')
  expect(await saleCount()).toBe(1)
  expect(sentMessages.at(-1)?.text).toContain('INV-')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/telegram-sales.test.ts`

Expected: FAIL because the sale-state handler is absent.

- [ ] **Step 3: Implement the guided sale flow**

Implement `/sale` replacement, existing customer search, new customer creation, anonymous customer, bounded product search, positive integer quantity, add-more/continue, payment choice, review, confirm, and cancel. Callback data must contain only IDs/actions, never mutable prices or totals. At confirm, call `createCompletedSale` with `source: 'telegram'`, delete the draft after commit, and send the text receipt. If stock changed, retain/review the draft with the shared service’s error; do not create a partial sale.

- [ ] **Step 4: Add idempotent confirmation coverage and pass tests**

```ts
test('a repeated sale confirmation cannot create a second sale', async () => {
  await telegramCallback('sale:confirm')
  await telegramCallback('sale:confirm')
  expect(await saleCount()).toBe(1)
})
```

Run: `bun test tests/telegram-sales.test.ts`

Expected: PASS for a full sale, customer creation, insufficient stock, cancel, stale callback, and repeated confirmation.

- [ ] **Step 5: Commit**

```bash
git add src/server/telegram/conversations.ts src/server/telegram/sale-flow.ts tests/telegram-sales.test.ts
git commit -m "feat: add Telegram sales"
```

### Task 10: Add the Telegram expense conversation

**Files:**
- Modify: `src/server/telegram/conversations.ts`
- Create: `src/server/telegram/expense-flow.ts`
- Create: `tests/telegram-expenses.test.ts`

**Interfaces:**
- Consumes: Telegram primitives from Task 8 and `createExpense`/active categories from Tasks 3 and 5.
- Produces: `handleTelegramExpense(input: TelegramInboundMessage, actor: Actor): Promise<void>` and expense states `expense.category`, `expense.amount`, `expense.notes`, `expense.confirm`.

- [ ] **Step 1: Write the failing conversation test**

```ts
test('confirmed Telegram expense records one expense without stock movement', async () => {
  await telegramText('/expense')
  await telegramCallback(`expense:category:${categoryId}`)
  await telegramText('25000')
  await telegramCallback('expense:notes:skip')
  await telegramCallback('expense:confirm')
  expect(await expenseCount()).toBe(1)
  expect(await stockMovementCount()).toBe(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/telegram-expenses.test.ts`

Expected: FAIL because the expense-state handler is absent.

- [ ] **Step 3: Implement the guided expense flow**

Implement `/expense` replacement, active category selection, positive integer IDR amount, optional note, review, confirm, and cancel. Set `transactionDate` to the server’s current YYYY-MM-DD at confirmation. At confirm call `createExpense` with `source: 'telegram'`, delete the draft after commit, and send an expense-number confirmation. Do not offer category creation, editing, cancellation, or an inventory action.

- [ ] **Step 4: Run focused tests**

Run: `bun test tests/telegram-expenses.test.ts`

Expected: PASS for valid flow, inactive category, invalid amount, cancel, stale callback, and repeated confirmation.

- [ ] **Step 5: Commit**

```bash
git add src/server/telegram/conversations.ts src/server/telegram/expense-flow.ts tests/telegram-expenses.test.ts
git commit -m "feat: add Telegram expenses"
```

### Task 11: Serve the built app and document operating it

**Files:**
- Create: `src/server/index.ts`
- Create: `README.md`
- Modify: `.env.example`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: Hono app, Vite `dist/`, config, and all behavior from Tasks 1–10.
- Produces: `bun run dev`, `bun run build`, `bun run start`, migration/setup instructions, webhook-registration instructions, and a verified production-style app response.

- [ ] **Step 1: Write the failing smoke test**

```ts
test('serves the SPA fallback and the health endpoint', async () => {
  expect((await app.request('/health')).status).toBe(200)
  expect((await app.request('/pos')).status).toBe(200)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/smoke.test.ts`

Expected: FAIL because the entrypoint/static fallback is incomplete.

- [ ] **Step 3: Implement only the operational boundary**

Mount the API and webhook before the static SPA fallback, add `/health`, serve built Vite files in production, and fall back non-API browser paths to `index.html`. Document installation, migration, initial-admin creation, `.env` values, local web-only development, HTTPS webhook registration with `secret_token`, and the manual sale/expense/cancellation smoke test.

- [ ] **Step 4: Run full verification**

Run: `bun run build && bun test && bun run db:migrate`

Expected: build succeeds, every test passes, and migrations apply to an empty database.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts README.md .env.example tests/smoke.test.ts
git commit -m "docs: add POS deployment guide"
```

## Plan self-review

| Specification requirement | Plan task(s) |
| --- | --- |
| Bun/Hono/Svelte/Drizzle/SQLite/Telegram with no extra service | 1, 7, 8, 11 |
| Roles and administrator-managed configuration | 2, 3, 6, 7 |
| Products, customers, integer stock, and movements | 1, 3, 4, 6, 7 |
| Shared web/Telegram completed sales and receipts | 4, 6, 7, 9 |
| Web-only cancellation with stock restoration | 4, 6, 7 |
| Non-inventory expenses and web-managed categories | 3, 5, 6, 7 |
| Telegram sales and expense conversations | 8, 9, 10 |
| Webhook secret, private active staff, idempotency, expiry | 3, 8, 9, 10 |
| Automated tests and manual operational test | 1–11, especially 4, 5, 8–11 |

The plan contains no placeholder tasks. `SaleInput`, `ExpenseInput`, `Actor`, `SaleReceipt`, `ExpenseReceipt`, `createCompletedSale`, `cancelSale`, and `createExpense` are defined before later tasks use them.
