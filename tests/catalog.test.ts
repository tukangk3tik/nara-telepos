import { expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/server/app'
import { expenseCategories, products, stockMovements, telegramStaff, users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function setup() {
  const db = createTestDatabase()
  const passwordHash = await Bun.password.hash(password)
  const [admin] = await db.insert(users).values([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'Cashier', email: 'cashier@example.test', passwordHash, role: 'cashier' },
  ]).returning({ id: users.id, role: users.role })
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
    db,
    admin: admin!,
    adminRequest: (path: string, init?: RequestInit) => requestAs('admin@example.test', path, init),
    cashierRequest: (path: string, init?: RequestInit) => requestAs('cashier@example.test', path, init),
  }
}

test('only an admin can adjust stock and every adjustment records a movement', async () => {
  const { db, adminRequest, cashierRequest } = await setup()
  const product = await db.insert(products).values({ name: 'Coffee', sku: 'COF-1', salePrice: 15000, stockQuantity: 2 }).returning({ id: products.id }).get()

  expect((await cashierRequest(`/api/products/${product!.id}/stock-adjustments`, {
    method: 'POST', body: JSON.stringify({ quantityDelta: 5 }),
  })).status).toBe(403)

  expect((await adminRequest(`/api/products/${product!.id}/stock-adjustments`, {
    method: 'POST', body: JSON.stringify({ quantityDelta: 5 }),
  })).status).toBe(200)
  expect(db.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, product!.id)).get()).toEqual({ stockQuantity: 7 })
  expect(db.select({ quantityDelta: stockMovements.quantityDelta, reason: stockMovements.reason }).from(stockMovements).where(eq(stockMovements.productId, product!.id)).get()).toEqual({ quantityDelta: 5, reason: 'adjustment' })
})

test('a cashier can create, search, and edit a customer', async () => {
  const { cashierRequest } = await setup()
  const created = await cashierRequest('/api/customers', { method: 'POST', body: JSON.stringify({ name: 'Maya', phone: '08123' }) })

  expect(created.status).toBe(201)
  const customer = await created.json() as { id: number; name: string }
  expect(await (await cashierRequest('/api/customers?q=maya')).json()).toMatchObject([{ id: customer.id, name: 'Maya' }])
  expect((await cashierRequest(`/api/customers/${customer.id}`, {
    method: 'PUT', body: JSON.stringify({ name: 'Maya Putri', phone: '08999' }),
  })).status).toBe(200)
})

test('inactive expense categories are excluded from active choices', async () => {
  const { adminRequest } = await setup()
  await adminRequest('/api/settings/expense-categories', { method: 'POST', body: JSON.stringify({ name: 'Transport' }) })
  const inactive = await adminRequest('/api/settings/expense-categories', { method: 'POST', body: JSON.stringify({ name: 'Legacy' }) })
  const { id } = await inactive.json() as { id: number }
  expect((await adminRequest(`/api/settings/expense-categories/${id}`, {
    method: 'PUT', body: JSON.stringify({ isActive: false }),
  })).status).toBe(200)

  expect(await (await adminRequest('/api/settings/expense-categories/active')).json()).toEqual([expect.objectContaining({ name: 'Transport', isActive: true })])
})

test('Telegram staff links are unique and inactive links cannot authorize a staff member', async () => {
  const { db, admin, adminRequest } = await setup()
  const other = await db.insert(users).values({ name: 'Other', email: 'other@example.test', passwordHash: await Bun.password.hash(password), role: 'cashier' }).returning({ id: users.id }).get()

  expect((await adminRequest('/api/settings/telegram-staff', {
    method: 'POST', body: JSON.stringify({ userId: admin.id, telegramUserId: '12345' }),
  })).status).toBe(201)
  expect((await adminRequest('/api/settings/telegram-staff', {
    method: 'POST', body: JSON.stringify({ userId: other!.id, telegramUserId: '12345' }),
  })).status).toBe(409)

  const link = db.select({ id: telegramStaff.id }).from(telegramStaff).where(eq(telegramStaff.userId, admin.id)).get()
  expect((await adminRequest(`/api/settings/telegram-staff/${link!.id}`, {
    method: 'PUT', body: JSON.stringify({ isActive: false }),
  })).status).toBe(200)
  expect((await import('../src/server/services/staff')).findActiveTelegramStaff(db, '12345')).toBeNull()
})

test('only an admin can manage products, users, and the store profile', async () => {
  const { adminRequest, cashierRequest } = await setup()
  expect((await cashierRequest('/api/products', { method: 'POST', body: JSON.stringify({ name: 'Tea', sku: 'TEA-1', salePrice: 10000, stockQuantity: 1 }) })).status).toBe(403)
  expect((await cashierRequest('/api/settings/profile', { method: 'PUT', body: JSON.stringify({ storeName: 'Nara', receiptFooter: 'Thanks' }) })).status).toBe(403)
  expect((await adminRequest('/api/settings/profile', { method: 'PUT', body: JSON.stringify({ storeName: 'Nara', receiptFooter: 'Thanks' }) })).status).toBe(200)
  expect((await adminRequest('/api/settings/users', { method: 'POST', body: JSON.stringify({ name: 'New Cashier', email: 'new@example.test', password, role: 'cashier' }) })).status).toBe(201)
})
