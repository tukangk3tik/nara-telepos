import { expect, setSystemTime, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/server/app'
import { expenseCategories, expenses, products, sales, users } from '../src/server/db/schema'
import { serverLocalDate } from '../src/server/telegram/expense-flow'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function setupDashboard(extraExpenses = 0) {
  const db = createTestDatabase()
  const passwordHash = await Bun.password.hash(password)
  const [admin, cashier] = db.insert(users).values([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'Cashier', email: 'cashier@example.test', passwordHash, role: 'cashier' },
  ]).returning().all()
  const category = db.insert(expenseCategories).values({ name: 'Supplies' }).returning().get()!
  const date = serverLocalDate()
  const yesterday = serverLocalDate(new Date(Date.now() - 86_400_000))

  db.insert(sales).values([
    { invoiceNumber: 'INV-001', paymentMethod: 'cash', subtotalAmount: 15000, totalAmount: 15000, source: 'web', createdByUserId: cashier!.id, completedAt: `${date}T09:00:00.000Z` },
    { invoiceNumber: 'INV-002', paymentMethod: 'cash', subtotalAmount: 20000, totalAmount: 20000, source: 'web', createdByUserId: cashier!.id, completedAt: `${date}T10:00:00.000Z`, cancelledAt: `${date}T10:30:00.000Z`, cancelledByUserId: admin!.id, cancellationReason: 'Duplicate' },
  ]).run()
  db.insert(expenses).values([
    { expenseNumber: 'EXP-001', expenseCategoryId: category.id, amount: 5000, transactionDate: date, source: 'web', createdByUserId: cashier!.id, createdAt: `${date}T08:00:00.000Z` },
    { expenseNumber: 'EXP-002', expenseCategoryId: category.id, amount: 7000, transactionDate: yesterday, source: 'web', createdByUserId: cashier!.id, createdAt: `${yesterday}T08:00:00.000Z` },
    ...Array.from({ length: extraExpenses }, (_, index) => ({
      expenseNumber: `EXP-EXTRA-${index}`,
      expenseCategoryId: category.id,
      amount: 100,
      transactionDate: yesterday,
      source: 'web' as const,
      createdByUserId: cashier!.id,
      createdAt: `${date}T${String(11 + index).padStart(2, '0')}:00:00.000Z`,
    })),
  ]).run()
  db.insert(products).values([
    { name: 'Empty', sku: 'EMPTY', salePrice: 1000, stockQuantity: 0 },
    { name: 'Threshold', sku: 'THRESHOLD', salePrice: 1000, stockQuantity: 5 },
    { name: 'Stocked', sku: 'STOCKED', salePrice: 1000, stockQuantity: 6 },
    { name: 'Inactive', sku: 'INACTIVE', salePrice: 1000, stockQuantity: 1, isActive: false },
  ]).run()

  const app = createApp({ db, sessionSecret: 'test-session-secret' })
  async function requestAs(email: string, path: string) {
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return app.request(path, { headers: { cookie: login.headers.get('set-cookie')! } })
  }

  return {
    app,
    db,
    adminRequest: (path: string) => requestAs('admin@example.test', path),
    cashierRequest: (path: string) => requestAs('cashier@example.test', path),
  }
}

const setupDashboardWithNineTransactions = () => setupDashboard(5)

test('dashboard returns today totals and operational lists for admins', async () => {
  const { adminRequest } = await setupDashboard()
  const response = await adminRequest('/api/dashboard')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(expect.objectContaining({
    date: serverLocalDate(),
    salesTotal: 15000,
    expensesTotal: 5000,
    netProfit: 10000,
    lowStockProducts: [
      { id: expect.any(Number), name: 'Empty', sku: 'EMPTY', stockQuantity: 0 },
      { id: expect.any(Number), name: 'Threshold', sku: 'THRESHOLD', stockQuantity: 5 },
    ],
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
  expect(body.recentTransactions.map((entry: { occurredAt: string }) => entry.occurredAt))
    .toEqual([...body.recentTransactions].map((entry: { occurredAt: string }) => entry.occurredAt).sort().reverse())
})

test('dashboard totals use the server-local day at a non-UTC boundary', async () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'Pacific/Kiritimati'
  setSystemTime(new Date('2026-09-13T12:33:01.204Z'))

  try {
    const { adminRequest, db } = await setupDashboard()
    db.update(sales).set({ completedAt: '2026-09-13T12:33:01.204Z' })
      .where(eq(sales.invoiceNumber, 'INV-001')).run()

    const body = await (await adminRequest('/api/dashboard')).json()

    expect(body.date).toBe('2026-09-14')
    expect(body.salesTotal).toBe(15000)
  } finally {
    setSystemTime()
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('dashboard orders ISO sales and SQLite expense timestamps chronologically', async () => {
  const { adminRequest, db } = await setupDashboard()
  const date = serverLocalDate()
  db.update(sales).set({ completedAt: `${date}T08:00:00.000Z` })
    .where(eq(sales.invoiceNumber, 'INV-001')).run()
  db.update(expenses).set({ createdAt: `${date} 10:00:00` })
    .where(eq(expenses.expenseNumber, 'EXP-001')).run()

  const body = await (await adminRequest('/api/dashboard')).json()
  const expense = body.recentTransactions.find((entry: { reference: string }) => entry.reference === 'EXP-001')

  expect(body.recentTransactions.findIndex((entry: { reference: string }) => entry.reference === 'EXP-001'))
    .toBeLessThan(body.recentTransactions.findIndex((entry: { reference: string }) => entry.reference === 'INV-001'))
  expect(expense.occurredAt).toBe(`${date}T10:00:00.000Z`)
})
