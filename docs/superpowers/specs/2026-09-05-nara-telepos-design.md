# Nara TelePOS MVP Design

**Status:** approved design, pending implementation plan  
**Date:** 2026-09-05

## Purpose

Build a general-purpose point-of-sale application inspired by SimpleF-POS. It must support normal retail sales from a web cashier and from an authorized Telegram bot. It is not a dolomite-specific system.

The MVP is optimized for reliable completed sales: every sale records item-price snapshots, updates stock exactly once, and produces a receipt.

## Technology

- **Frontend:** Svelte single-page application
- **Runtime and API:** Bun and Hono in one service
- **Database:** SQLite accessed through Drizzle ORM
- **Bot:** Telegram Bot API called with Bun `fetch`

The Hono service serves the built Svelte app and JSON API from the same origin. A separate SvelteKit server, Telegram SDK, queue, or extra service is intentionally out of scope.

## Scope

### Included

- Login with `admin` and `cashier` roles.
- Product catalog with SKU/barcode, sale price, active status, and tracked integer stock.
- Product create/edit and admin stock adjustments.
- Optional customer records on a sale; customers can be created in the web app or during a Telegram sale.
- Completed sale creation from web and Telegram using `cash`, `transfer`, or `qris` payment methods.
- Sale history and sale detail.
- Admin-only sale cancellation with a required reason and stock restoration.
- Non-inventory expense records with category, amount, transaction date, optional notes, creator, and source (`web` or `telegram`).
- Admin-managed expense categories, created and configured only in the web app.
- Admin-managed links from a POS user to a Telegram numeric user ID, with active/inactive status.
- Telegram private-chat guided sale and expense flows, explicit confirmation, text receipts, webhook verification, and idempotent update handling.
- Web-only configuration for master data: products, stock adjustments, customers, expense categories, POS users, Telegram staff links, and store profile.

### Excluded

- Raw materials, bills of materials, machine costs, vehicles, and all other dolomite-domain behavior.
- Product purchasing and stock intake.
- Credit, unpaid, split, or partial payments.
- Telegram cancellation, refund, edit, report, category management, or self-registration flows.
- Reports, exports, print/PDF receipts, discounts, taxes, multi-location inventory, procurement, and accounting ledger.
- Group-chat operation, multi-currency, fractional quantity, offline synchronization, and a Telegram Mini App.

## Roles

| Capability | Admin | Cashier |
| --- | :---: | :---: |
| Sign in | Yes | Yes |
| Create web sales | Yes | Yes |
| Create Telegram sales when linked and active | Yes | Yes |
| Create web and Telegram expenses | Yes | Yes |
| Create customers | Yes | Yes |
| View sale and expense history/details | Yes | Own records only |
| Manage products, stock adjustments, and expense categories | Yes | No |
| Configure master data and store settings | Yes | No |
| Manage POS users and Telegram staff | Yes | No |
| Cancel a sale | Yes | No |

## Data model

All money values are integer IDR. Product quantities are positive integers. Timestamps use UTC.

### `users`

`id`, `name`, `email` (unique), `password_hash`, `role`, `created_at`, `updated_at`.

### `products`

`id`, `name`, `sku` (unique), `barcode` (unique, nullable), `sale_price`, `stock_quantity`, `is_active`, `created_at`, `updated_at`.

### `customers`

`id`, `name`, `phone` (nullable), `email` (nullable), `created_at`, `updated_at`.

### `sales`

`id`, `invoice_number` (unique), `customer_id` (nullable), `payment_method`, `subtotal_amount`, `total_amount`, `source` (`web` or `telegram`), `created_by_user_id`, `completed_at`, `cancelled_at` (nullable), `cancelled_by_user_id` (nullable), `cancellation_reason` (nullable), `created_at`.

`total_amount` equals `subtotal_amount` in this MVP because discounts and taxes are excluded.

### `sale_items`

`id`, `sale_id`, `product_id`, `product_name`, `sku`, `quantity`, `unit_price`, `line_total`.

The name, SKU, and price are snapshots, preserving historic receipts after product edits.

### `stock_movements`

`id`, `product_id`, `quantity_delta`, `reason` (`sale`, `sale_cancellation`, `adjustment`), `reference_type`, `reference_id`, `created_by_user_id`, `created_at`.

### `expense_categories`

`id`, `name` (unique), `is_active`, `created_at`, `updated_at`.

### `expenses`

`id`, `expense_number` (unique), `expense_category_id`, `amount`, `transaction_date`, `notes` (nullable), `source` (`web` or `telegram`), `created_by_user_id`, `created_at`.

Expenses are non-inventory cash outflows. They never alter a product or stock movement.

### `telegram_staff`

`id`, `user_id` (unique), `telegram_user_id` (unique), `is_active`, `created_at`, `updated_at`.

### `telegram_updates`

`update_id` (primary key), `received_at`, `processed_at` (nullable).

The primary key makes Telegram webhook retries harmless.

### `telegram_conversations`

`id`, `telegram_user_id` (unique), `chat_id`, `state`, `draft_json`, `expires_at`, `updated_at`.

One private-chat draft exists per Telegram user. It is deleted after success or cancellation and treated as expired after its expiry time.

## Shared sale workflow

`createCompletedSale(input, actor)` is the only write path for a completed sale, regardless of its source.

1. Validate a nonempty set of items, payment method, optional customer, actor permission, and active products.
2. Start a SQLite transaction.
3. Re-read each product, verify sufficient stock, and use its stored current price. The client never supplies an authoritative price or total.
4. Calculate line amounts and the sale total server-side.
5. Insert the sale and its price-snapshot items.
6. Decrement each product stock and add the matching `stock_movements` row.
7. Commit and return the sale/receipt data.

An admin cancellation is a separate transaction. It rejects already-cancelled sales, records the cancelling admin and reason, restores each product’s quantity, and adds compensating `sale_cancellation` movements. It never deletes a sale.

`createExpense(input, actor)` is likewise shared by web and Telegram. It validates the active category, positive integer amount, date, notes, and actor permission, then inserts one expense in a database transaction. It does not affect inventory.

## Web application

### Cashier

- Product search by name, SKU, or barcode.
- Add products to a cart, adjust quantity within available stock, select or create a customer, choose payment method, and confirm sale.
- Show a receipt/sale detail after success.
- Show the caller’s sale history and details.
- Record an expense by selecting an active category, entering amount/date/optional note, and confirming.
- Show the caller’s expense history and details.

### Administration

- Product CRUD and stock adjustment with reason.
- Customer list and creation/editing.
- Expense-category CRUD; inactive categories remain on historic records but cannot be selected for new expenses.
- Full sale and expense history/detail, plus sale cancellation.
- POS user/staff management and store-profile configuration.

## Telegram bot

Only direct messages from an active `telegram_staff` mapping may transact. An unmapped, inactive, group-chat, malformed, or expired action receives a safe explanatory response and changes no business data.

`/sale` starts or replaces a draft. The guided interaction is:

1. Select an existing customer, create a customer, or continue without one.
2. Search products by name/SKU/barcode and select one from a bounded inline-keyboard result list.
3. Enter a positive integer quantity; add another item or continue.
4. Choose `cash`, `transfer`, or `qris`.
5. Read a complete review containing customer, items, quantities, total, and payment method.
6. Press **Confirm** to commit or **Cancel** to discard.
7. On success, receive a text receipt with invoice number, item lines, total, payment method, and sale detail URL.

The confirmation step reloads the product state through the shared sale workflow, so stock may still reject a draft whose availability changed while the user was chatting.

`/expense` starts or replaces a draft. The guided interaction is:

1. Choose an active expense category from an inline keyboard.
2. Enter a positive integer amount in IDR.
3. Enter an optional note or choose to skip it.
4. Read the category, amount, date, and note review.
5. Press **Confirm** to create the expense or **Cancel** to discard it.
6. On success, receive a text confirmation with the expense number and amount.

Telegram never creates or edits expense categories. Expense records have no Telegram cancellation or edit action.

## Webhook and failure behavior

- `POST /telegram/webhook` checks `X-Telegram-Bot-Api-Secret-Token` against the configured secret before parsing the update.
- The handler claims `update_id` in `telegram_updates` before it processes the message. A duplicate returns success without repeating the conversation or sale.
- Invalid or unsupported input leaves the existing draft intact when correction is possible and states the correction needed.
- Stale callback buttons do not commit anything; the bot asks the user to restart or continue the current draft.
- A Telegram API send failure is logged after commit. It cannot roll back a valid sale; the web sale history remains the source of truth.

## API surface

The exact route names are implementation details, but the MVP needs authenticated endpoints for session login/logout, store settings, POS users, products, stock adjustments, customers, expense categories, sales/create/history/detail/cancel, expenses/create/history/detail, Telegram staff links, and a public Telegram webhook endpoint.

Browser write endpoints must enforce the signed-in actor’s role. The Telegram webhook must derive its actor only from the active staff mapping, never from user input.

## Verification

Automated tests must cover:

- A completed sale writes snapshot items, decreases stock, and creates stock movements.
- Insufficient stock fails without partial sale or stock changes.
- Web and Telegram inputs use the same sale function and produce equivalent records.
- Admin cancellation restores stock once; a second cancellation is rejected.
- A valid expense is stored without changing stock; an inactive category is rejected.
- Web and Telegram expense inputs create equivalent records.
- Duplicate Telegram `update_id` and repeated confirmation cannot create duplicate sales.
- Duplicate Telegram confirmation cannot create duplicate expenses.
- Inactive/unlinked Telegram users cannot start a sale or expense.

A manual smoke test must create a product, expense category, and Telegram staff link; complete a private-chat sale and expense; verify both confirmations and web history; then cancel the sale as an admin and verify stock restoration.

## Configuration

Required environment variables:

- `DATABASE_URL` — SQLite database file path.
- `SESSION_SECRET` — signed session secret.
- `TELEGRAM_BOT_TOKEN` — BotFather token.
- `TELEGRAM_WEBHOOK_SECRET` — random webhook secret registered with Telegram.
- `APP_BASE_URL` — public HTTPS base URL for webhook registration and receipt links.

Local development may run the web POS without Telegram enabled. Production Telegram use requires a publicly reachable HTTPS webhook URL.
