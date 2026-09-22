# Operations Workspace Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated route a consistent, responsive operations-workspace layout without changing behavior.

**Architecture:** Keep the existing route state and handlers. Use the current Tailwind and shadcn-svelte components: the application shell adopts Clean Slate tokens, each route owns its heading/grid, and existing Table primitives retain responsive data rendering. A shared page component is unnecessary because each route has different secondary content.

**Tech Stack:** Svelte 5, Tailwind CSS 4, shadcn-svelte, Bun test, Vite.

**Spec:** `docs/superpowers/specs/2026-09-22-operations-workspace-layout.md`

## Global Constraints

- Preserve every API call, action, permission rule, and route.
- Reuse existing shadcn-svelte primitives; add no dependencies.
- Keep existing Table primitives, sidebar navigation, and small-screen table overflow.
- Do not add a dark-mode toggle, sorting, filtering, pagination, or bulk actions.

---

### Task 1: Token-based application shell

**Files:**
- Modify: `src/client/App.svelte:47-101`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes: existing `actor`, `path`, `navigate`, and `logout` state.
- Produces: identical navigation and route rendering with a responsive, theme-token shell.

- [ ] **Step 1: Write the failing shell assertion**

```ts
test('authenticated shell uses theme tokens and a responsive content frame', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain('bg-background text-foreground')
  expect(source).toContain('max-w-7xl')
  expect(source).not.toContain('bg-slate-50')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because the shell has `bg-slate-50` and `max-w-[1200px]`.

- [ ] **Step 3: Implement the shell layout**

Replace hard-coded `slate-*` classes in the authenticated shell, header, and navigation with `background`, `foreground`, `border`, `muted`, `muted-foreground`, and `accent` token classes. Preserve all links, handlers, and role conditions. Replace the main frame with:

```svelte
<main class="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
```

- [ ] **Step 4: Verify the focused test is green**

Run: `bun test tests/client-ui.test.ts`

Expected: PASS, including navigation assertions.

- [ ] **Step 5: Commit**

Run: `git add src/client/App.svelte tests/client-ui.test.ts && git commit -m "Refine the operations app shell"`

### Task 2: Dashboard overview workspace

**Files:**
- Modify: `src/client/routes/Dashboard.svelte:31-90`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes: existing `DashboardSummary` and `load`.
- Produces: unchanged metrics and tables in an overview plus responsive detail workspace.

- [ ] **Step 1: Write the failing dashboard assertion**

```ts
test('dashboard uses an overview grid and operations workspace', () => {
  const source = route('Dashboard')
  expect(source).toContain('Today at a glance')
  expect(source).toContain('sm:grid-cols-2 lg:grid-cols-3')
  expect(source).toContain('xl:grid-cols-2')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because there is no overview copy or two-column detail grid.

- [ ] **Step 3: Implement the dashboard hierarchy**

Keep all values, keys, badges, table cells, and empty states. Use this heading, use `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` for metrics, and wrap the existing Recent transactions and Low stock cards in `grid gap-6 xl:grid-cols-2` with `h-full` on each card:

```svelte
<div><h1 class="text-3xl font-semibold tracking-tight">Dashboard</h1><p class="text-sm text-muted-foreground">Today at a glance · {summary.date}</p></div>
```

- [ ] **Step 4: Verify the focused test is green**

Run: `bun test tests/client-ui.test.ts`

Expected: PASS with Table primitive assertions.

- [ ] **Step 5: Commit**

Run: `git add src/client/routes/Dashboard.svelte tests/client-ui.test.ts && git commit -m "Restructure the dashboard workspace"`

### Task 3: POS catalogue and checkout workspace

**Files:**
- Modify: `src/client/routes/Pos.svelte:75-151`
- Modify: `src/client/components/Cart.svelte:18-39`
- Modify: `src/client/components/CustomerForm.svelte:37-59`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes: existing `cart`, `customer`, `paymentMethod`, `Cart`, and `CustomerForm` props.
- Produces: the same sale flow in a desktop catalogue/checkout split that stacks in source order on smaller screens.

- [ ] **Step 1: Write the failing POS assertion**

```ts
test('POS keeps its checkout workspace responsive', () => {
  const source = route('Pos')
  expect(source).toContain('xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]')
  expect(source).toContain('Catalogue')
  expect(source).toContain('Checkout')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because the route has the prior grid ratio and no workspace labels.

- [ ] **Step 3: Implement the POS hierarchy**

Add the `New sale` heading and `Build the order, choose a customer, and take payment.` support text. Change the outer work area to `grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]`. Label the product card `Catalogue`; label the right column `Checkout` and make it `xl:sticky xl:top-20`. Keep the product search, Table, `Cart`, `CustomerForm`, payment controls, dialog, and receipt handlers unchanged.

- [ ] **Step 4: Tighten the supporting panels**

In `Cart.svelte`, use `CardContent class="grid gap-4"`; in `CustomerForm.svelte`, use `CardContent class="grid gap-5"`. Do not change props, IDs, `for` attributes, or callbacks.

- [ ] **Step 5: Verify the focused test is green**

Run: `bun test tests/client-ui.test.ts`

Expected: PASS, including POS select and Table primitive tests.

- [ ] **Step 6: Commit**

Run: `git add src/client/routes/Pos.svelte src/client/components/Cart.svelte src/client/components/CustomerForm.svelte tests/client-ui.test.ts && git commit -m "Refine the POS checkout workspace"`

### Task 4: Sales and expenses work areas

**Files:**
- Modify: `src/client/routes/Sales.svelte:80-129`
- Modify: `src/client/routes/Expenses.svelte:62-111`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes: existing sale cancellation/detail handlers and expense creation/detail handlers.
- Produces: unchanged actions with clearer headings, table cards, and responsive detail placement.

- [ ] **Step 1: Write the failing route-workspace assertion**

```ts
test.each(['Sales', 'Expenses'])('%s has a history workspace header', (name) => {
  const source = route(name)
  expect(source).toContain('text-3xl font-semibold tracking-tight')
  expect(source).toContain('gap-6')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because the routes use compact heading/card spacing.

- [ ] **Step 3: Implement Sales layout**

Wrap the history card and conditional selected-sale card in `div class="grid gap-6"`. Add `Sales history` and `Review completed sales and open their receipts.` above the table. Preserve the Table, Details button, cancellation dialog, and all API state. Change the selected receipt card from `max-w-2xl` to `max-w-4xl`.

- [ ] **Step 4: Implement Expenses layout**

Add an `Expenses` title and `Record costs and review recent spending.` support text above the existing form/history grid. Change that grid to `grid gap-6 xl:grid-cols-[minmax(20rem,.8fr)_minmax(0,1.2fr)]`. Preserve the form, history Table, Details button, and selected expense article.

- [ ] **Step 5: Verify the focused test is green**

Run: `bun test tests/client-ui.test.ts`

Expected: PASS with cancellation, expense, select, and Table tests unchanged.

- [ ] **Step 6: Commit**

Run: `git add src/client/routes/Sales.svelte src/client/routes/Expenses.svelte tests/client-ui.test.ts && git commit -m "Organize sales and expense work areas"`

### Task 5: Settings administration workspace and integration verification

**Files:**
- Modify: `src/client/routes/Settings.svelte:200-271`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes: existing forms, tabs, dialogs, handlers, and the `settings()` test helper.
- Produces: unchanged administration controls with clear hierarchy and verified responsive spacing.

- [ ] **Step 1: Write the failing Settings assertion**

```ts
test('settings has a responsive administration workspace', () => {
  const source = route('Settings')
  expect(source).toContain('Manage catalogue, staff, and store settings.')
  expect(source).toContain('gap-6 xl:grid-cols-3')
  expect(source).toContain('gap-6 xl:grid-cols-2')
})
```

- [ ] **Step 2: Verify the test is red**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because no support copy exists and grids use `gap-4`.

- [ ] **Step 3: Implement the Settings layout**

Replace the top heading with this title block. Change the outer route wrapper and `Tabs.Root` to `gap-6`; change catalog and team grids to `grid gap-6 xl:grid-cols-3` and `grid gap-6 xl:grid-cols-2`. Preserve every form, Table, dialog, handler, and `settings()` helper interface.

```svelte
<div><h1 class="text-3xl font-semibold tracking-tight">Settings</h1><p class="text-muted-foreground">Manage catalogue, staff, and store settings.</p></div>
```

- [ ] **Step 4: Verify all route layout tests**

Run: `bun test tests/client-ui.test.ts`

Expected: PASS, including stock-adjustment and Telegram checker behavior tests.

- [ ] **Step 5: Verify integration**

Run: `bun test && bun run build && git diff --check`

Expected: all tests pass, Vite exits 0, and diff check prints no errors.

- [ ] **Step 6: Commit**

Run: `git add src/client/routes/Settings.svelte tests/client-ui.test.ts && git commit -m "Refine the settings administration workspace"`
