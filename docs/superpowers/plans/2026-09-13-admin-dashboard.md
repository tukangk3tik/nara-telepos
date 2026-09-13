# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only dashboard showing today’s sales, expenses, net profit, recent transactions, and low-stock products.

**Architecture:** Add one authenticated `/api/dashboard` route that aggregates existing SQLite tables for the server-local day. Add one Svelte route and admin-only navigation links using the existing shadcn-svelte components; keep POS as the fallback route for non-dashboard paths.

**Tech Stack:** Bun, Hono, Drizzle ORM, SQLite, Svelte 5, shadcn-svelte, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-13-admin-dashboard-design.md`

## Global Constraints

- Dashboard access is administrator-only; cashiers receive `403` from the API and see no dashboard link.
- The dashboard date is the existing server-local date, with no date filter or polling.
- Low stock means active products with `stockQuantity <= 5`.
- Do not add dependencies or charts.
- Preserve `/pos` as the fallback route.

### Task 1: Add the admin dashboard API

**Files:**
- Create: `src/server/routes/dashboard.ts`
- Modify: `src/server/app.ts`
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Produces `GET /api/dashboard` returning `DashboardSummary` from the spec.
- Consumes existing `requireActor`, `requireRole`, `sales`, `expenses`, `expenseCategories`, and `products` database definitions.

- [ ] **Step 1: Write the failing route tests**

Add a test setup with admin and cashier users, two sales (one cancelled), two expenses on different dates, and active/inactive products around the threshold. Assert:

```ts
test('dashboard returns today totals and operational lists for admins', async () => {
  const { adminRequest } = await setupDashboard()
  const response = await adminRequest('/api/dashboard')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(expect.objectContaining({
    salesTotal: 15000,
    expensesTotal: 5000,
    netProfit: 10000,
    lowStockProducts: [expect.objectContaining({ stockQuantity: 0 })],
  }))
})

test('dashboard is unavailable to cashiers and anonymous requests', async () => {
  const { app, cashierRequest } = await setupDashboard()
  expect((await app.request('/api/dashboard')).status).toBe(401)
  expect((await cashierRequest('/api/dashboard')).status).toBe(403)
})

test('dashboard limits recent transactions and excludes cancelled sales from totals', async () => {
  const { adminRequest } = await setupDashboardWithNineTransactions()
  const body = await (await adminRequest('/api/dashboard')).json()
  expect(body.recentTransactions).toHaveLength(8)
  expect(body.salesTotal).toBe(15000)
  expect(body.recentTransactions.some((entry: { cancelled: boolean }) => entry.cancelled)).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `bun test tests/dashboard.test.ts`

Expected: FAIL because `/api/dashboard` is not mounted.

- [ ] **Step 3: Implement the route**

Create `createDashboardRoutes({ db })` with an admin guard and synchronous Drizzle queries. Use `serverLocalDate()` for `date`; filter sales by `completedAt` prefix and `cancelledAt IS NULL` for `salesTotal`, filter expenses by `transactionDate`, select active products with stock at or below five, combine sale/expense rows, sort by `occurredAt` descending, and slice eight. Mount it after session middleware and before the other API routes:

```ts
app.use('/api/dashboard', requireRole('admin'))
app.route('/api/dashboard', createDashboardRoutes({ db }))
```

- [ ] **Step 4: Run focused and full tests**

Run: `bun test tests/dashboard.test.ts && bun test`

Expected: dashboard tests and all existing tests pass.

- [ ] **Step 5: Commit the API**

```sh
git add src/server/routes/dashboard.ts src/server/app.ts tests/dashboard.test.ts
git commit -m "feat: add admin dashboard summary API"
```

### Task 2: Add the dashboard page and admin navigation

**Files:**
- Create: `src/client/routes/Dashboard.svelte`
- Modify: `src/client/App.svelte`
- Test: `tests/client-ui.test.ts`

**Interfaces:**
- Consumes `GET /api/dashboard` from Task 1.
- Produces an admin-only `/dashboard` route with cards, transaction table, and low-stock list.

- [ ] **Step 1: Write the failing client source test**

Append assertions that both navigation copies contain an admin-only Dashboard link and `App.svelte` imports/renders `Dashboard` only for `/dashboard` and an admin actor:

```ts
test('dashboard navigation and route are admin-only', () => {
  const source = readFileSync(new URL('../src/client/App.svelte', import.meta.url), 'utf8')
  expect(source).toContain("import Dashboard from './routes/Dashboard.svelte'")
  expect(source.match(/Dashboard/g)?.length).toBeGreaterThanOrEqual(3)
  expect(source).toContain("actor.role === 'admin'")
  expect(source).toContain("path === '/dashboard'")
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `bun test tests/client-ui.test.ts`

Expected: FAIL because the Dashboard import and route do not exist.

- [ ] **Step 3: Implement the page and navigation**

Create `Dashboard.svelte` with the existing `Card`, `Badge`, `Alert`, and table primitives. Fetch `/api/dashboard` in `onMount`, format IDR using the project’s existing `Intl.NumberFormat` pattern, and render loading/error/empty states. Add Dashboard links to both desktop and mobile admin navigation. Add the `/dashboard` branch before the POS fallback; retain POS for cashiers and unknown paths.

- [ ] **Step 4: Run client tests and build**

Run: `bun test tests/client-ui.test.ts && bun run build`

Expected: focused client tests pass and Vite builds successfully.

- [ ] **Step 5: Commit the UI**

```sh
git add src/client/routes/Dashboard.svelte src/client/App.svelte tests/client-ui.test.ts
git commit -m "feat: add admin dashboard page"
```

### Task 3: Final verification

**Files:**
- Modify: none unless verification exposes an issue.

- [ ] **Step 1: Run the complete verification set**

Run: `bun test && bun run build && bun run db:migrate && git diff --check`

Expected: all tests pass, the build succeeds, migrations complete, and the diff is clean.

- [ ] **Step 2: Review the final diff against the spec**

Confirm the API is admin-only, totals use the server-local date, cancelled sales do not contribute to sales total, recent transactions are capped at eight, low-stock uses the active `<= 5` rule, and cashiers do not receive dashboard navigation.

- [ ] **Step 3: Commit any verification-only correction**

```sh
git add src/server/routes/dashboard.ts src/server/app.ts tests/dashboard.test.ts src/client/routes/Dashboard.svelte src/client/App.svelte tests/client-ui.test.ts
git commit -m "fix: complete admin dashboard verification"
```
