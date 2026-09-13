# Admin Dashboard Design

## Goal

Add an admin-only dashboard that summarizes the current server-local day and highlights operational follow-up items.

## Scope

The dashboard is available at `/dashboard` and is visible in navigation only to administrators. It contains:

- Today’s completed, non-cancelled sales total.
- Today’s recorded expenses total.
- Net profit as sales minus expenses.
- The latest eight combined sale and expense records.
- Active products with stock quantity less than or equal to five.

The dashboard has an explicit empty state for each list and uses the existing shadcn-svelte cards, badges, and tables. It does not add charts, date filters, polling, or a new dependency.

## API contract

`GET /api/dashboard` requires an authenticated administrator. Cashiers receive `403`.

The response shape is:

```ts
type DashboardSummary = {
  date: string
  salesTotal: number
  expensesTotal: number
  netProfit: number
  recentTransactions: Array<{
    kind: 'sale' | 'expense'
    id: number
    reference: string
    amount: number
    occurredAt: string
    cancelled: boolean
  }>
  lowStockProducts: Array<{
    id: number
    name: string
    sku: string
    stockQuantity: number
  }>
}
```

Sales are filtered by `completedAt` date and exclude cancelled rows from `salesTotal`; expenses are filtered by `transactionDate`. The dashboard date uses the existing server-local date convention. Recent records are sorted newest first and limited to eight. Low-stock products are active products at or below five units, sorted by stock quantity and then name.

## Authorization and integration

The route is mounted after session middleware and protected with the existing admin role guard. The client route is rendered only when the loaded actor is an admin; an unknown `/dashboard` path falls back to POS as before. The desktop and mobile navigation each receive one admin-only Dashboard link.

## Verification

Add route tests for unauthenticated, cashier, and administrator access, including today’s totals, cancelled-sale exclusion, recent ordering/limit, and low-stock threshold. Add a client source test that confirms the dashboard navigation and route are admin-only. Run `bun test`, `bun run build`, and `git diff --check` before handoff.
