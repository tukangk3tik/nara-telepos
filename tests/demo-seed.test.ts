import { expect, test } from 'bun:test'
import { count, eq } from 'drizzle-orm'
import { seedDemo } from '../src/server/seed-demo'
import { createTestDatabase } from './helpers/database'
import { expenseCategories, expenses, products, sales, users } from '../src/server/db/schema'

test('adds repeatable demo sales and expenses without duplicating demo master data', async () => {
  const db = createTestDatabase()
  db.insert(users).values({ name: 'Owner', email: 'owner@example.test', passwordHash: 'unused', role: 'admin' }).run()

  await seedDemo(db)
  const first = {
    products: db.select({ count: count() }).from(products).where(eq(products.sku, 'DEMO-COFFEE')).get()!.count,
    categories: db.select({ count: count() }).from(expenseCategories).where(eq(expenseCategories.name, 'Demo supplies')).get()!.count,
    sales: db.select({ count: count() }).from(sales).get()!.count,
    expenses: db.select({ count: count() }).from(expenses).get()!.count,
  }

  await seedDemo(db)
  expect(first).toEqual({ products: 1, categories: 1, sales: 2, expenses: 2 })
  expect(db.select({ count: count() }).from(products).where(eq(products.sku, 'DEMO-COFFEE')).get()!.count).toBe(1)
  expect(db.select({ count: count() }).from(expenseCategories).where(eq(expenseCategories.name, 'Demo supplies')).get()!.count).toBe(1)
  expect(db.select({ count: count() }).from(sales).get()!.count).toBe(4)
  expect(db.select({ count: count() }).from(expenses).get()!.count).toBe(4)
})

test('does not leave demo sales behind when demo expenses cannot be created', async () => {
  const db = createTestDatabase()
  db.insert(users).values({ name: 'Owner', email: 'owner@example.test', passwordHash: 'unused', role: 'admin' }).run()
  db.insert(expenseCategories).values({ name: 'Demo supplies', isActive: false }).run()

  await expect(seedDemo(db)).rejects.toThrow('Expense category is inactive')
  expect(db.select({ count: count() }).from(sales).get()!.count).toBe(0)
  expect(db.select({ count: count() }).from(expenses).get()!.count).toBe(0)
})
