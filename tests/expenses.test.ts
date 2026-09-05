import { expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { ExpenseInput } from '../src/server/domain/types'
import { createExpense } from '../src/server/services/expenses'
import { expenseCategories, expenses, products, stockMovements, users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

async function setup() {
  const db = createTestDatabase()
  const cashier = db.insert(users).values({ name: 'Cashier', email: 'cashier@example.test', passwordHash: 'hash', role: 'cashier' }).returning({ id: users.id, role: users.role }).get()!
  const category = db.insert(expenseCategories).values({ name: 'Transport' }).returning().get()!
  const inactiveCategory = db.insert(expenseCategories).values({ name: 'Legacy', isActive: false }).returning().get()!
  const product = db.insert(products).values({ name: 'Coffee', sku: 'COF-1', salePrice: 15000, stockQuantity: 5 }).returning().get()!
  return { db, cashier, category, inactiveCategory, product }
}

test('records a non-inventory expense', async () => {
  const { db, cashier, category, product } = await setup()

  const receipt = await createExpense(db, {
    expenseCategoryId: category.id, amount: 25000, transactionDate: '2026-09-05', source: 'web', notes: 'courier',
  }, cashier)

  expect(receipt).toMatchObject({ amount: 25000, categoryName: 'Transport', transactionDate: '2026-09-05' })
  expect(receipt.expenseNumber).toMatch(/^EXP-/)
  expect(db.select({ amount: expenses.amount, notes: expenses.notes, createdByUserId: expenses.createdByUserId })
    .from(expenses).where(eq(expenses.id, receipt.id)).get()).toEqual({ amount: 25000, notes: 'courier', createdByUserId: cashier.id })
  expect(db.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, product.id)).get()).toEqual({ stockQuantity: 5 })
  expect(db.select({ id: stockMovements.id }).from(stockMovements).all()).toEqual([])
})

test('rejects an inactive category without recording an expense', async () => {
  const { db, cashier, inactiveCategory } = await setup()

  await expect(createExpense(db, {
    expenseCategoryId: inactiveCategory.id, amount: 1, transactionDate: '2026-09-05', source: 'web',
  }, cashier)).rejects.toMatchObject({ code: 'EXPENSE_CATEGORY_INACTIVE' })

  expect(db.select({ id: expenses.id }).from(expenses).all()).toEqual([])
})

test('rejects malformed expense input without recording an expense', async () => {
  const { db, cashier, category } = await setup()
  const input: ExpenseInput = { expenseCategoryId: category.id, amount: 1, transactionDate: '2026-09-05', source: 'telegram' }

  for (const invalidInput of [
    { ...input, amount: 0 },
    { ...input, amount: 1.5 },
    { ...input, amount: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, transactionDate: '2026-02-30' },
    { ...input, transactionDate: '05-09-2026' },
    { ...input, notes: 'x'.repeat(1001) },
  ]) {
    await expect(createExpense(db, invalidInput as ExpenseInput, cashier)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }

  expect(db.select({ id: expenses.id }).from(expenses).all()).toEqual([])
})

test('rejects malformed or stale actors without recording an expense', async () => {
  const { db, cashier, category } = await setup()
  const input: ExpenseInput = { expenseCategoryId: category.id, amount: 1, transactionDate: '2026-09-05', source: 'telegram' }

  await expect(createExpense(db, input, { id: 0, role: 'cashier' })).rejects.toMatchObject({ code: 'INVALID_ACTOR' })
  await expect(createExpense(db, input, { id: cashier.id, role: 'admin' })).rejects.toMatchObject({ code: 'FORBIDDEN' })

  expect(db.select({ id: expenses.id }).from(expenses).all()).toEqual([])
})
