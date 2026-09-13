import { expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { SaleInput } from '../src/server/domain/types'
import { cancelSale, createCompletedSale } from '../src/server/services/sales'
import { customers, products, saleItems, sales, stockMovements, users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

async function setup() {
  const db = createTestDatabase()
  const [admin, cashier] = await db.insert(users).values([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'hash', role: 'admin' },
    { name: 'Cashier', email: 'cashier@example.test', passwordHash: 'hash', role: 'cashier' },
  ]).returning({ id: users.id, role: users.role })
  const product = db.insert(products).values({ name: 'Coffee', sku: 'COF-1', salePrice: 15000, stockQuantity: 5 }).returning().get()!
  return { db, admin: admin!, cashier: cashier!, product }
}

function productStock(db: ReturnType<typeof createTestDatabase>, productId: number) {
  return db.select({ stockQuantity: products.stockQuantity }).from(products).where(eq(products.id, productId)).get()?.stockQuantity
}

test('creates server-priced snapshots and stock movements atomically', async () => {
  const { db, cashier, product } = await setup()
  const input = {
    source: 'web',
    paymentMethod: 'cash',
    items: [{ productId: product.id, quantity: 2, unitPrice: 1 }],
    totalAmount: 1,
  } as unknown as SaleInput

  const receipt = await createCompletedSale(db, input, cashier)

  expect(receipt).toMatchObject({ totalAmount: 30000, paymentMethod: 'cash', source: 'web' })
  expect(receipt.lines).toEqual([{ productName: 'Coffee', quantity: 2, unitPrice: 15000, lineTotal: 30000 }])
  expect(productStock(db, product.id)).toBe(3)
  expect(db.select({ productName: saleItems.productName, sku: saleItems.sku, unitPrice: saleItems.unitPrice, lineTotal: saleItems.lineTotal })
    .from(saleItems).where(eq(saleItems.saleId, receipt.id)).get()).toEqual({ productName: 'Coffee', sku: 'COF-1', unitPrice: 15000, lineTotal: 30000 })
  expect(db.select({ quantityDelta: stockMovements.quantityDelta, reason: stockMovements.reason, referenceId: stockMovements.referenceId, createdByUserId: stockMovements.createdByUserId })
    .from(stockMovements).where(eq(stockMovements.productId, product.id)).get()).toEqual({ quantityDelta: -2, reason: 'sale', referenceId: receipt.id, createdByUserId: cashier.id })
})

test('rejects insufficient stock without partial writes', async () => {
  const { db, cashier, product } = await setup()
  const tea = db.insert(products).values({ name: 'Tea', sku: 'TEA-1', salePrice: 10000, stockQuantity: 1 }).returning().get()!

  await expect(createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1 }, { productId: tea.id, quantity: 2 }],
  }, cashier)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })

  expect(productStock(db, product.id)).toBe(5)
  expect(productStock(db, tea.id)).toBe(1)
  expect(db.select({ id: sales.id }).from(sales).all()).toEqual([])
  expect(db.select({ id: saleItems.id }).from(saleItems).all()).toEqual([])
  expect(db.select({ id: stockMovements.id }).from(stockMovements).all()).toEqual([])
})

test('requires unique positive integer lines and an existing optional customer', async () => {
  const { db, cashier, product } = await setup()

  await expect(createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 1 }],
  }, cashier)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1.5 }],
  }, cashier)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', customerId: 999, items: [{ productId: product.id, quantity: 1 }],
  }, cashier)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' })

  expect(productStock(db, product.id)).toBe(5)
  expect(db.select({ id: sales.id }).from(sales).all()).toEqual([])
})

test('rejects inactive products without a sale or stock movement', async () => {
  const { db, cashier, product } = await setup()
  db.update(products).set({ isActive: false }).where(eq(products.id, product.id)).run()

  await expect(createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1 }],
  }, cashier)).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' })

  expect(productStock(db, product.id)).toBe(5)
  expect(db.select({ id: sales.id }).from(sales).all()).toEqual([])
  expect(db.select({ id: stockMovements.id }).from(stockMovements).all()).toEqual([])
})

test('records an optional customer and Telegram source', async () => {
  const { db, cashier, product } = await setup()
  const customer = db.insert(customers).values({ name: 'Maya' }).returning().get()!

  const receipt = await createCompletedSale(db, {
    source: 'telegram', paymentMethod: 'qris', customerId: customer.id, items: [{ productId: product.id, quantity: 1 }],
  }, cashier)

  expect(receipt).toMatchObject({ customerId: customer.id, source: 'telegram' })
  expect(db.select({ customerId: sales.customerId, source: sales.source }).from(sales).where(eq(sales.id, receipt.id)).get()).toEqual({ customerId: customer.id, source: 'telegram' })
})

test('an admin cancellation restores stock exactly once and keeps the sale', async () => {
  const { db, admin, cashier, product } = await setup()
  const sale = await createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 2 }],
  }, cashier)

  await cancelSale(db, sale.id, 'Customer changed mind', admin)

  expect(productStock(db, product.id)).toBe(5)
  expect(db.select({ cancelledAt: sales.cancelledAt, cancelledByUserId: sales.cancelledByUserId, cancellationReason: sales.cancellationReason })
    .from(sales).where(eq(sales.id, sale.id)).get()).toEqual({ cancelledAt: expect.any(String), cancelledByUserId: admin.id, cancellationReason: 'Customer changed mind' })
  expect(db.select({ quantityDelta: stockMovements.quantityDelta, reason: stockMovements.reason }).from(stockMovements)
    .where(eq(stockMovements.productId, product.id)).all()).toEqual([{ quantityDelta: -2, reason: 'sale' }, { quantityDelta: 2, reason: 'sale_cancellation' }])
  expect(db.select({ id: saleItems.id }).from(saleItems).where(eq(saleItems.saleId, sale.id)).all()).toHaveLength(1)
  await expect(cancelSale(db, sale.id, 'again', admin)).rejects.toMatchObject({ code: 'SALE_ALREADY_CANCELLED' })
  expect(productStock(db, product.id)).toBe(5)
})

test('rejects cashier and blank-reason cancellations without writes', async () => {
  const { db, admin, cashier, product } = await setup()
  const sale = await createCompletedSale(db, {
    source: 'web', paymentMethod: 'cash', items: [{ productId: product.id, quantity: 1 }],
  }, cashier)

  await expect(cancelSale(db, sale.id, 'No authority', cashier)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(cancelSale(db, sale.id, '  ', admin)).rejects.toMatchObject({ code: 'INVALID_INPUT' })

  expect(productStock(db, product.id)).toBe(4)
  expect(db.select({ cancelledAt: sales.cancelledAt }).from(sales).where(eq(sales.id, sale.id)).get()).toEqual({ cancelledAt: null })
  expect(db.select({ reason: stockMovements.reason }).from(stockMovements).where(eq(stockMovements.productId, product.id)).all()).toEqual([{ reason: 'sale' }])
})
