# Shadcn Slate UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every TelePOS client screen to a plain slate shadcn-svelte admin UI without changing server behavior.

**Architecture:** Configure Tailwind and shadcn-svelte for the existing Vite/Svelte 5 SPA, then consume only generated primitives from `src/lib/components/ui`. Keep API calls and state in their existing route components. Extract the validation needed by replacement dialogs to a small dependency-free client module so it can be tested with Bun.

**Tech Stack:** Bun, Svelte 5, Vite, Tailwind CSS, shadcn-svelte, lucide-svelte, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-12-shadcn-slate-ui-design.md`

## Global Constraints

- Preserve every client route, API request, role check, form constraint, disabled state, error message, and success message; do not touch `src/server/**` or the database.
- Use the shadcn-svelte slate Vite setup and generated source components; do not introduce SvelteKit or a runtime component-library dependency.
- Generate only Alert, Badge, Button, Card, Dialog, Input, Label, Select, Table, Tabs, and Textarea, plus `lucide-svelte` icons.
- Keep semantic labels, alert/status roles, keyboard-reachable navigation, responsive stacked layouts, and horizontally scrollable tables.
- Use `bun test` and `bun run build` after every functional task; manually run the README smoke flow before handoff.

---

## Planned file structure

| Path | Responsibility |
| --- | --- |
| `package.json`, `bun.lock`, `components.json`, `tsconfig.json`, `vite.config.ts` | Tailwind/shadcn-svelte dependencies, component-generator metadata, and `$lib` resolution. |
| `src/client/app.css` | Tailwind import and slate CSS variables; no page-specific component CSS. |
| `src/lib/utils.ts`, `src/lib/components/ui/**` | shadcn-generated `cn` utility and only the listed primitive source files. |
| `src/client/lib/dialog-validation.ts`, `tests/dialog-validation.test.ts` | Pure validation for cancellation and stock-adjustment dialogs. |
| `src/client/App.svelte`, `src/client/routes/Login.svelte` | Responsive authenticated shell and sign-in card. |
| `src/client/components/Cart.svelte`, `src/client/components/CustomerForm.svelte`, `src/client/routes/Pos.svelte` | Slate POS workflow, customer controls, payment confirmation, and receipt. |
| `src/client/routes/Sales.svelte`, `src/client/routes/Expenses.svelte` | Slate history/entry pages and cancellation dialog. |
| `src/client/routes/Settings.svelte` | Tabbed admin settings, stock-adjustment dialog, and unlink confirmation. |

### Task 1: Add the shadcn-svelte slate foundation

**Files:**
- Modify: `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `src/client/app.css`
- Create: `components.json`, `src/lib/utils.ts`, `src/lib/components/ui/{alert,badge,button,card,dialog,input,label,select,table,tabs,textarea}/**`
- Test: `src/client/main.ts` (existing build entry)

**Interfaces:**
- Consumes: Vite’s existing `src/client/main.ts` entry and `src/client/app.css` import.
- Produces: `$lib` resolving to `src/lib`, Tailwind classes compiling in `.svelte` files, and named imports such as `import { Button } from '$lib/components/ui/button/index.js'`.

- [ ] **Step 1: Verify the untouched client builds**

Run: `bun run build`

Expected: PASS. This establishes the baseline before modifying generated configuration.

- [ ] **Step 2: Install and initialize the supported Vite setup**

Run the current shadcn-svelte Vite flow with Bun: add Tailwind with `bunx sv add tailwindcss`, then initialize with `bunx shadcn-svelte@latest init`. Choose TypeScript, the `default` style, the `slate` base color, `src/client/app.css` as global CSS, `$lib` as the library alias, `$lib/components` as the component alias, and `$lib/components/ui` as the UI alias. Add the required generated primitives in one command:

```sh
bunx shadcn-svelte@latest add alert badge button card dialog input label select table tabs textarea
```

Do not replace the SPA with a SvelteKit project.

- [ ] **Step 3: Map `$lib` to the existing source tree**

Configure TypeScript and Vite to agree on this exact alias:

```ts
// vite.config.ts
import path from 'node:path'

resolve: { alias: { $lib: path.resolve('src/lib') } }
```

```json
// tsconfig.json compilerOptions
{ "baseUrl": ".", "paths": { "$lib": ["./src/lib"], "$lib/*": ["./src/lib/*"] } }
```

Keep the Tailwind global import and slate variables in `src/client/app.css`; remove the previous hand-written `.card`, `.secondary`, `.danger`, layout, and element-reset rules after consumers are migrated in later tasks.

- [ ] **Step 4: Verify generated components compile**

Run: `bun run build`

Expected: PASS with the existing UI still rendered by the unmodified route components.

- [ ] **Step 5: Commit the foundation**

```sh
git add package.json bun.lock components.json tsconfig.json vite.config.ts src/client/app.css src/lib
git commit -m "chore: add shadcn slate foundation"
```

### Task 2: Test dialog-input validation before replacing browser prompts

**Files:**
- Create: `src/client/lib/dialog-validation.ts`, `tests/dialog-validation.test.ts`

**Interfaces:**
- Produces: `cancellationReason(value: string): string | null` and `stockAdjustment(input: { quantityDelta: string; reason: string }): { quantityDelta: number; reason: string } | null`.
- Consumes: nothing; later callers show their existing error text when these return `null`.

- [ ] **Step 1: Write failing focused tests**

```ts
import { expect, test } from 'bun:test'
import { cancellationReason, stockAdjustment } from '../src/client/lib/dialog-validation'

test('requires a nonblank cancellation reason', () => {
  expect(cancellationReason('  ')).toBeNull()
  expect(cancellationReason('Duplicate sale')).toBe('Duplicate sale')
})

test('requires a nonzero whole-number stock adjustment and a reason', () => {
  expect(stockAdjustment({ quantityDelta: '0', reason: 'count' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '2.5', reason: 'count' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '-2', reason: '  ' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '-2', reason: 'count correction' })).toEqual({ quantityDelta: -2, reason: 'count correction' })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/dialog-validation.test.ts`

Expected: FAIL because `dialog-validation.ts` does not exist.

- [ ] **Step 3: Implement the pure validation helpers**

```ts
export const cancellationReason = (value: string) => value.trim() || null

export function stockAdjustment({ quantityDelta, reason }: { quantityDelta: string; reason: string }) {
  const quantity = Number(quantityDelta)
  const trimmedReason = reason.trim()
  return Number.isInteger(quantity) && quantity !== 0 && trimmedReason
    ? { quantityDelta: quantity, reason: trimmedReason }
    : null
}
```

- [ ] **Step 4: Verify the test and full suite pass**

Run: `bun test tests/dialog-validation.test.ts && bun test`

Expected: PASS.

- [ ] **Step 5: Commit the tested behavior**

```sh
git add src/client/lib/dialog-validation.ts tests/dialog-validation.test.ts
git commit -m "test: cover dialog validation"
```

### Task 3: Convert the app shell and sign-in page

**Files:**
- Modify: `src/client/App.svelte`, `src/client/routes/Login.svelte`, `src/client/app.css`
- Test: `tests/dialog-validation.test.ts`

**Interfaces:**
- Consumes: `Actor`, `loadActor`, `navigate`, and `logout` already defined in `App.svelte`; `Login`’s existing `onSuccess` callback.
- Produces: unchanged route selection and a responsive slate shell with an admin-only Settings link.

- [ ] **Step 1: Run the focused regression test before editing markup**

Run: `bun test tests/dialog-validation.test.ts`

Expected: PASS. The shell change must not affect dialog behavior.

- [ ] **Step 2: Replace shell markup with slate primitives and utility classes**

Use `Button` for sign out and lucide icons for POS, Sales, Expenses, Settings, and logout. Keep each current `<a href>` and its `onclick` call to `navigate`, including `path === '/' ? '/pos' : window.location.pathname`. Use a sticky header and a left navigation rail at `md` and above; show a compact horizontal navigation bar below `md`.

```svelte
<a href="/pos" onclick={(event) => { event.preventDefault(); navigate('/pos') }} class:...>
  <ShoppingCart /> <span>POS</span>
</a>
```

Use neutral `bg-slate-*`, `border-slate-*`, and `text-slate-*` classes. Preserve `aria-label="Main navigation"` and the role check around Settings.

- [ ] **Step 3: Convert Login to a Card form**

Import `Card`, `Input`, `Label`, `Button`, and `Alert`. Retain `type`, `autocomplete`, `required`, `bind:value`, `onsubmit`, disabled state, and the existing error fallback. Render errors as:

```svelte
{#if error}<Alert variant="destructive" role="alert">{error}</Alert>{/if}
```

- [ ] **Step 4: Verify build and existing tests**

Run: `bun test && bun run build`

Expected: PASS.

- [ ] **Step 5: Commit the shell**

```sh
git add src/client/App.svelte src/client/routes/Login.svelte src/client/app.css
git commit -m "feat: add slate application shell"
```

### Task 4: Convert the POS, cart, customer, and receipt experience

**Files:**
- Modify: `src/client/routes/Pos.svelte`, `src/client/components/Cart.svelte`, `src/client/components/CustomerForm.svelte`
- Test: `tests/dialog-validation.test.ts`

**Interfaces:**
- Consumes: existing `api`, `CartLine`, `onQuantity`, `onRemove`, `onSelect`, and sale request payloads.
- Produces: exactly the same `POST /api/sales` body, cart stock limit, customer selection, and receipt data.

- [ ] **Step 1: Run the regression test before POS changes**

Run: `bun test tests/dialog-validation.test.ts`

Expected: PASS.

- [ ] **Step 2: Restyle product search and cart without changing state code**

Use `Card` for product/search, cart, customer, payment, and receipt sections; `Input`, `Label`, `Select`, and `Button` for controls; and `Badge` for stock and payment labels. Retain these behavior-critical statements unchanged:

```ts
if (existing.quantity < product.stockQuantity) ...
Math.min(Math.floor(quantity) || 1, item.stockQuantity)
body: JSON.stringify({ items: cart.map(({ id, quantity }) => ({ productId: id, quantity })), customerId: customer?.id, paymentMethod })
```

Use responsive utility grids (`lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]`) rather than custom CSS.

- [ ] **Step 3: Replace sale confirmation with Dialog**

Keep the guard `if (!cart.length) return`. Store whether the confirmation dialog is open in local state, show the calculated total, and call the existing `confirmSale` request logic only from its confirmed action. Cancel must close the dialog without altering the cart. Retain `submitting` and the existing API error rendering.

- [ ] **Step 4: Verify build and tests**

Run: `bun test && bun run build`

Expected: PASS.

- [ ] **Step 5: Manually check the POS critical path**

Run `bun run dev`, sign in, add an in-stock product, change its quantity, select/create a customer, choose each payment method, cancel the confirmation once, then complete it once. Confirm the receipt still shows its invoice, lines, and total.

- [ ] **Step 6: Commit the POS migration**

```sh
git add src/client/routes/Pos.svelte src/client/components/Cart.svelte src/client/components/CustomerForm.svelte
git commit -m "feat: migrate POS to shadcn slate"
```

### Task 5: Convert sales history and expenses, including safe cancellation

**Files:**
- Modify: `src/client/routes/Sales.svelte`, `src/client/routes/Expenses.svelte`
- Test: `tests/dialog-validation.test.ts`

**Interfaces:**
- Consumes: `cancellationReason`, existing `api` calls, the `Actor` role property, and current sale/expense types.
- Produces: the same `POST /api/sales/:id/cancel` payload `{ reason }`; unchanged expense creation payload.

- [ ] **Step 1: Run validation tests before dialog migration**

Run: `bun test tests/dialog-validation.test.ts`

Expected: PASS.

- [ ] **Step 2: Replace Sales table and browser prompt**

Use `Table`, `Badge`, `Button`, `Card`, `Alert`, and `Dialog`. Track `saleToCancel: Sale | null` and `cancelReason = ''`. On confirmation, call `cancellationReason(cancelReason)`; if null, set the existing error text and keep the dialog open. Otherwise call:

```ts
await api<void>(`/api/sales/${saleToCancel.id}/cancel`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reason }),
})
```

Retain the admin-only `!sale.cancelledAt` rule and mobile horizontal table scrolling.

- [ ] **Step 3: Convert Expenses to Cards and controls**

Use `Card`, `Select`, `Input`, `Textarea`, `Button`, `Alert`, and Badge/table-style rows. Preserve the native `type="date"`, `min="1"`, category-empty disabled state, `transactionDate` initialization, creation payload, and detail request.

- [ ] **Step 4: Verify build and tests**

Run: `bun test && bun run build`

Expected: PASS.

- [ ] **Step 5: Commit the history pages**

```sh
git add src/client/routes/Sales.svelte src/client/routes/Expenses.svelte
git commit -m "feat: migrate history pages to shadcn slate"
```

### Task 6: Convert Settings to tabbed admin groups and dialogs

**Files:**
- Modify: `src/client/routes/Settings.svelte`
- Test: `tests/dialog-validation.test.ts`

**Interfaces:**
- Consumes: `stockAdjustment`, existing `api` endpoints and types, and every existing form handler in `Settings.svelte`.
- Produces: unchanged settings request bodies; explicit dialog confirmation for stock changes and Telegram unlinking.

- [ ] **Step 1: Run the stock-adjustment test before replacing prompts**

Run: `bun test tests/dialog-validation.test.ts`

Expected: PASS.

- [ ] **Step 2: Group forms into Tabs and Cards**

Use Tabs with `Catalog` (products, customers, categories), `Team` (users, Telegram links), and `Store` (profile). Keep all forms and their existing `onsubmit`, `bind:value`, type, `required`, active checkbox, and handler references. Retain the `role=status` success message and `role=alert` error message using shadcn Alert.

- [ ] **Step 3: Replace stock and unlink browser dialogs**

Replace `prompt()` in `adjustStock` with `stockToAdjust: Product | null`, `quantityDelta`, and `adjustmentReason` fields in a Dialog. On confirmation, call `stockAdjustment`; if it returns `null`, set exactly `error = 'Stock adjustment reason is required'` for blank reasons and `error = 'Enter a non-zero whole-number stock adjustment'` otherwise. On valid input, submit the existing endpoint and body:

```ts
body: JSON.stringify({ quantityDelta: result.quantityDelta, reason: result.reason })
```

Replace Telegram unlink `confirm()` with a Dialog whose destructive action calls the existing `DELETE /api/settings/telegram-staff/:id` request. Closing either dialog clears its local form state and makes no request.

- [ ] **Step 4: Verify build and tests**

Run: `bun test && bun run build`

Expected: PASS.

- [ ] **Step 5: Manually verify protected administration actions**

As an admin, create/edit a product, cancel a stock dialog, submit an invalid adjustment, submit a valid adjustment, change a user role, cancel an unlink, and confirm an unlink. Confirm the role-restricted Settings nav remains invisible to cashiers.

- [ ] **Step 6: Commit the settings migration**

```sh
git add src/client/routes/Settings.svelte
git commit -m "feat: migrate settings to shadcn slate"
```

### Task 7: Remove obsolete styling and complete release checks

**Files:**
- Modify: `src/client/app.css`
- Test: `tests/dialog-validation.test.ts`

**Interfaces:**
- Consumes: migrated pages using Tailwind and shadcn primitives.
- Produces: only theme-level global CSS, with no old custom component or layout selectors.

- [ ] **Step 1: Confirm no old CSS contract remains in client templates**

Run:

```sh
rg -n 'class="(card|secondary|danger|app-header|pos-grid|two-column|settings-grid|compact-form|record-list|line-list|product-list|table-wrap)' src/client
```

Expected: no matches. Replace any remaining presentational class with utility classes before deleting its CSS.

- [ ] **Step 2: Remove obsolete app-specific CSS**

Keep only Tailwind/shadcn theme imports, CSS variables, box sizing, and any truly global accessibility-safe defaults. Do not retain custom `.card`, button color, responsive-grid, list, table, or alert classes that duplicate the migrated components.

- [ ] **Step 3: Run complete automated verification**

Run: `bun test && bun run build && bun run db:migrate`

Expected: all tests pass, Vite produces `dist/`, and migrations complete without a schema change.

- [ ] **Step 4: Run the documented smoke flow**

Follow README’s manual smoke test with a disposable local database: sign in, create a category and stocked product, complete and cancel a sale, and create an expense. Confirm stock returns on cancellation and the slate interface remains usable at a narrow viewport.

- [ ] **Step 5: Commit final cleanup**

```sh
git add src/client/app.css src/client
git commit -m "style: remove legacy POS CSS"
```
