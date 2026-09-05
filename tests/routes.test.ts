import { expect, test } from 'bun:test'
import { createApp } from '../src/server/app'
import { expenseCategories, products, users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function setup() {
  const db = createTestDatabase()
  const passwordHash = await Bun.password.hash(password)
  db.insert(users).values([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'Cashier', email: 'cashier@example.test', passwordHash, role: 'cashier' },
    { name: 'Other Cashier', email: 'other@example.test', passwordHash, role: 'cashier' },
  ]).run()
  const product = db.insert(products).values({ name: 'Coffee', sku: 'COF-1', salePrice: 15000, stockQuantity: 10 }).returning().get()!
  const category = db.insert(expenseCategories).values({ name: 'Transport' }).returning().get()!
  const app = createApp({ db, sessionSecret: 'test-session-secret' })

  async function requestAs(email: string, path: string, init?: RequestInit) {
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return app.request(path, {
      ...init,
      headers: { 'content-type': 'application/json', cookie: login.headers.get('set-cookie')!, ...init?.headers },
    })
  }

  return {
    app,
    product,
    category,
    adminRequest: (path: string, init?: RequestInit) => requestAs('admin@example.test', path, init),
    cashierRequest: (path: string, init?: RequestInit) => requestAs('cashier@example.test', path, init),
    otherCashierRequest: (path: string, init?: RequestInit) => requestAs('other@example.test', path, init),
  }
}

test('POS sales and expense routes require authentication', async () => {
  const { app } = await setup()

  expect((await app.request('/api/sales')).status).toBe(401)
  expect((await app.request('/api/expenses')).status).toBe(401)
})

test('sale route ignores client prices and total and uses the shared transaction', async () => {
  const { cashierRequest, product } = await setup()

  const response = await cashierRequest('/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: 1, unitPrice: 1 }],
      paymentMethod: 'qris',
      totalAmount: 1,
    }),
  })

  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({
    totalAmount: 15000,
    paymentMethod: 'qris',
    source: 'web',
    lines: [{ productName: 'Coffee', quantity: 1, unitPrice: 15000, lineTotal: 15000 }],
  })
})

test('sale route maps malformed input to a bad request', async () => {
  const { cashierRequest } = await setup()

  const response = await cashierRequest('/api/sales', { method: 'POST', body: '{' })

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'INVALID_INPUT' })
})

test('sale route maps insufficient stock to an unprocessable request', async () => {
  const { cashierRequest, product } = await setup()

  const response = await cashierRequest('/api/sales', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: product.id, quantity: 11 }], paymentMethod: 'cash' }),
  })

  expect(response.status).toBe(422)
  expect(await response.json()).toEqual({ error: 'INSUFFICIENT_STOCK' })
})

test('cashier sale history excludes another cashier records', async () => {
  const { cashierRequest, otherCashierRequest, product } = await setup()
  const own = await cashierRequest('/api/sales', {
    method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'cash' }),
  })
  await otherCashierRequest('/api/sales', {
    method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'cash' }),
  })
  const sale = await own.json() as { id: number }
  const history = await (await cashierRequest('/api/sales')).json() as Array<{ id: number }>

  expect(history.map(({ id }) => id)).toEqual([sale.id])
})

test('cashier cannot view another cashier sale detail', async () => {
  const { cashierRequest, otherCashierRequest, product } = await setup()
  const created = await otherCashierRequest('/api/sales', {
    method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'cash' }),
  })
  const sale = await created.json() as { id: number }

  const response = await cashierRequest(`/api/sales/${sale.id}`)

  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'SALE_NOT_FOUND' })
})

test('only an admin can cancel a sale', async () => {
  const { adminRequest, cashierRequest, product } = await setup()
  const created = await cashierRequest('/api/sales', {
    method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'cash' }),
  })
  const sale = await created.json() as { id: number }

  expect((await cashierRequest(`/api/sales/${sale.id}/cancel`, {
    method: 'POST', body: JSON.stringify({ reason: 'Customer changed mind' }),
  })).status).toBe(403)
  expect((await adminRequest(`/api/sales/${sale.id}/cancel`, {
    method: 'POST', body: JSON.stringify({ reason: 'Customer changed mind' }),
  })).status).toBe(204)
})

test('sale route maps a second cancellation to conflict', async () => {
  const { adminRequest, cashierRequest, product } = await setup()
  const created = await cashierRequest('/api/sales', {
    method: 'POST', body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'cash' }),
  })
  const sale = await created.json() as { id: number }
  await adminRequest(`/api/sales/${sale.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Customer changed mind' }) })

  const response = await adminRequest(`/api/sales/${sale.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Again' }) })

  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'SALE_ALREADY_CANCELLED' })
})

test('expense route creates a web expense', async () => {
  const { cashierRequest, category } = await setup()

  const response = await cashierRequest('/api/expenses', {
    method: 'POST',
    body: JSON.stringify({ expenseCategoryId: category.id, amount: 25000, transactionDate: '2026-09-05', notes: 'courier' }),
  })

  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ amount: 25000, categoryName: 'Transport', transactionDate: '2026-09-05' })
})

test('cashier expense history excludes another cashier records', async () => {
  const { cashierRequest, otherCashierRequest, category } = await setup()
  const own = await cashierRequest('/api/expenses', {
    method: 'POST', body: JSON.stringify({ expenseCategoryId: category.id, amount: 25000, transactionDate: '2026-09-05' }),
  })
  await otherCashierRequest('/api/expenses', {
    method: 'POST', body: JSON.stringify({ expenseCategoryId: category.id, amount: 20000, transactionDate: '2026-09-05' }),
  })
  const expense = await own.json() as { id: number }
  const history = await (await cashierRequest('/api/expenses')).json() as Array<{ id: number }>

  expect(history.map(({ id }) => id)).toEqual([expense.id])
})

test('cashier cannot view another cashier expense detail', async () => {
  const { cashierRequest, otherCashierRequest, category } = await setup()
  const created = await otherCashierRequest('/api/expenses', {
    method: 'POST', body: JSON.stringify({ expenseCategoryId: category.id, amount: 25000, transactionDate: '2026-09-05' }),
  })
  const expense = await created.json() as { id: number }

  const response = await cashierRequest(`/api/expenses/${expense.id}`)

  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'EXPENSE_NOT_FOUND' })
})
