import { and, asc, eq, isNull, like, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import type { DatabaseClient } from '../db'
import { expenseCategories, expenses, products, sales } from '../db/schema'
import { serverLocalDate } from '../telegram/expense-flow'

export type DashboardSummary = {
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
  lowStockProducts: Array<{ id: number; name: string; sku: string; stockQuantity: number }>
}

export function createDashboardRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.get('/', (c) => {
    const date = serverLocalDate()
    const salesRows = db.select({ amount: sales.totalAmount }).from(sales)
      .where(and(like(sales.completedAt, `${date}%`), isNull(sales.cancelledAt))).all()
    const expenseRows = db.select({ amount: expenses.amount }).from(expenses)
      .where(eq(expenses.transactionDate, date)).all()
    const salesTotal = salesRows.reduce((total, row) => total + row.amount, 0)
    const expensesTotal = expenseRows.reduce((total, row) => total + row.amount, 0)
    const recentSales: DashboardSummary['recentTransactions'] = db.select({
      id: sales.id,
      reference: sales.invoiceNumber,
      amount: sales.totalAmount,
      occurredAt: sales.completedAt,
      cancelledAt: sales.cancelledAt,
    }).from(sales).all().map(({ cancelledAt, ...sale }) => ({ kind: 'sale', ...sale, cancelled: cancelledAt !== null }))
    const recentExpenses: DashboardSummary['recentTransactions'] = db.select({
      id: expenses.id,
      reference: expenses.expenseNumber,
      amount: expenses.amount,
      occurredAt: expenses.createdAt,
    }).from(expenses).innerJoin(expenseCategories, eq(expenses.expenseCategoryId, expenseCategories.id)).all()
      .map((expense) => ({ kind: 'expense', ...expense, cancelled: false }))

    return c.json({
      date,
      salesTotal,
      expensesTotal,
      netProfit: salesTotal - expensesTotal,
      recentTransactions: [...recentSales, ...recentExpenses]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
      lowStockProducts: db.select({ id: products.id, name: products.name, sku: products.sku, stockQuantity: products.stockQuantity })
        .from(products).where(and(eq(products.isActive, true), lte(products.stockQuantity, 5)))
        .orderBy(asc(products.stockQuantity), asc(products.name)).all(),
    } satisfies DashboardSummary)
  })

  return app
}
