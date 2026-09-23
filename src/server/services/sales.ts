import { eq, like, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../db'
import { customers, products, saleItems, sales, stockMovements, users } from '../db/schema'
import { DomainError, InsufficientStockError, SaleAlreadyCancelledError } from '../domain/errors'
import type { Actor, SaleInput } from '../domain/types'

type DatabaseExecutor = Omit<DatabaseClient, '$client'>

export type SaleReceipt = {
  id: number
  invoiceNumber: string
  totalAmount: number
  paymentMethod: SaleInput['paymentMethod']
  customerId: number | null
  source: SaleInput['source']
  lines: Array<{ productName: string; quantity: number; unitPrice: number; lineTotal: number }>
}

const invalid = (message: string): never => { throw new DomainError('INVALID_INPUT', message) }
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function validateActor(actor: Actor) {
  if (!actor || !isPositiveInteger(actor.id) || (actor.role !== 'admin' && actor.role !== 'cashier')) {
    throw new DomainError('INVALID_ACTOR', 'Invalid actor')
  }
  return actor
}

function validateSaleInput(input: SaleInput) {
  if (!input || typeof input !== 'object' || (input.source !== 'web' && input.source !== 'telegram')
    || (input.paymentMethod !== 'cash' && input.paymentMethod !== 'transfer' && input.paymentMethod !== 'qris')
    || !Array.isArray(input.items) || !input.items.length) invalid('Invalid sale')

  const customerId = input.customerId === undefined ? undefined : isPositiveInteger(input.customerId) ? input.customerId : invalid('Invalid customer')
  const productIds = new Set<number>()
  const items = input.items.map((item) => {
    if (!item || typeof item !== 'object' || !isPositiveInteger(item.productId) || !isPositiveInteger(item.quantity) || productIds.has(item.productId)) {
      invalid('Invalid sale item')
    }
    productIds.add(item.productId)
    return { productId: item.productId, quantity: item.quantity }
  })
  return { source: input.source, paymentMethod: input.paymentMethod, customerId, items }
}

export function createCompletedSaleSync(db: DatabaseExecutor, input: SaleInput, actor: Actor): SaleReceipt {
  return db.transaction((tx) => {
    const saleInput = validateSaleInput(input)
    const saleActor = validateActor(actor)
    const storedActor = tx.select({ role: users.role }).from(users).where(eq(users.id, saleActor.id)).get()
    if (!storedActor) throw new DomainError('ACTOR_NOT_FOUND', 'Actor not found')
    if (storedActor.role !== saleActor.role) throw new DomainError('FORBIDDEN', 'Actor role no longer applies')
    if (saleInput.customerId !== undefined && !tx.select({ id: customers.id }).from(customers).where(eq(customers.id, saleInput.customerId)).get()) {
      throw new DomainError('CUSTOMER_NOT_FOUND', 'Customer not found')
    }

    const lines = saleInput.items.map(({ productId, quantity }) => {
      const product = tx.select().from(products).where(eq(products.id, productId)).get()
      if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found')
      if (!product.isActive) throw new DomainError('PRODUCT_INACTIVE', 'Product is inactive')
      if (product.stockQuantity < quantity) throw new InsufficientStockError()
      const lineTotal = product.salePrice * quantity
      if (!Number.isSafeInteger(lineTotal)) throw new DomainError('INVALID_AMOUNT', 'Sale total is too large')
      return { product, quantity, lineTotal }
    })
    const totalAmount = lines.reduce((total, line) => total + line.lineTotal, 0)
    if (!Number.isSafeInteger(totalAmount)) throw new DomainError('INVALID_AMOUNT', 'Sale total is too large')

    const completedAt = new Date().toISOString()
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(completedAt)).split('/').reverse().join('')
    const prefix = `INV-${date}-`
    const lastSequence = tx.select({ value: sql<number>`coalesce(max(cast(substr(${sales.invoiceNumber}, 14) as integer)), 0)` })
      .from(sales).where(like(sales.invoiceNumber, `${prefix}%`)).get()?.value ?? 0
    const invoiceNumber = `${prefix}${String(lastSequence + 1).padStart(4, '0')}`
    const sale = tx.insert(sales).values({
      invoiceNumber,
      customerId: saleInput.customerId ?? null,
      paymentMethod: saleInput.paymentMethod,
      subtotalAmount: totalAmount,
      totalAmount,
      source: saleInput.source,
      createdByUserId: saleActor.id,
      completedAt,
    }).returning({ id: sales.id, invoiceNumber: sales.invoiceNumber }).get()
    if (!sale) throw new DomainError('SALE_CREATE_FAILED', 'Could not create sale')

    for (const { product, quantity, lineTotal } of lines) {
      tx.insert(saleItems).values({
        saleId: sale.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity,
        unitPrice: product.salePrice,
        lineTotal,
      }).run()
      tx.update(products).set({ stockQuantity: product.stockQuantity - quantity, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(products.id, product.id)).run()
      tx.insert(stockMovements).values({
        productId: product.id,
        quantityDelta: -quantity,
        reason: 'sale',
        referenceType: 'sale',
        referenceId: sale.id,
        createdByUserId: saleActor.id,
      }).run()
    }

    return {
      ...sale,
      totalAmount,
      paymentMethod: saleInput.paymentMethod,
      customerId: saleInput.customerId ?? null,
      source: saleInput.source,
      lines: lines.map(({ product, quantity, lineTotal }) => ({ productName: product.name, quantity, unitPrice: product.salePrice, lineTotal })),
    }
  }, { behavior: 'immediate' })
}

export async function createCompletedSale(db: DatabaseExecutor, input: SaleInput, actor: Actor): Promise<SaleReceipt> {
  return createCompletedSaleSync(db, input, actor)
}

export async function cancelSale(db: DatabaseClient, saleId: number, reason: string, actor: Actor): Promise<void> {
  return db.transaction((tx) => {
    if (!isPositiveInteger(saleId)) invalid('Invalid sale')
    const cancellationReason = typeof reason === 'string' ? reason.trim() : ''
    if (!cancellationReason) invalid('Cancellation reason is required')
    const saleActor = validateActor(actor)
    const storedActor = tx.select({ role: users.role }).from(users).where(eq(users.id, saleActor.id)).get()
    if (!storedActor) throw new DomainError('ACTOR_NOT_FOUND', 'Actor not found')
    if (storedActor.role !== saleActor.role || storedActor.role !== 'admin') throw new DomainError('FORBIDDEN', 'Administrator access required')

    const sale = tx.select({ id: sales.id, cancelledAt: sales.cancelledAt }).from(sales).where(eq(sales.id, saleId)).get()
    if (!sale) throw new DomainError('SALE_NOT_FOUND', 'Sale not found')
    if (sale.cancelledAt) throw new SaleAlreadyCancelledError()
    const items = tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id)).all()
    const restoredProducts = items.map((item) => {
      const product = tx.select().from(products).where(eq(products.id, item.productId)).get()
      if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found')
      const stockQuantity = product.stockQuantity + item.quantity
      if (!Number.isSafeInteger(stockQuantity)) throw new DomainError('INVALID_AMOUNT', 'Stock is too large')
      return { product, quantity: item.quantity, stockQuantity }
    })

    tx.update(sales).set({
      cancelledAt: new Date().toISOString(),
      cancelledByUserId: saleActor.id,
      cancellationReason,
    }).where(eq(sales.id, sale.id)).run()
    for (const { product, quantity, stockQuantity } of restoredProducts) {
      tx.update(products).set({ stockQuantity, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(products.id, product.id)).run()
      tx.insert(stockMovements).values({
        productId: product.id,
        quantityDelta: quantity,
        reason: 'sale_cancellation',
        referenceType: 'sale',
        referenceId: sale.id,
        createdByUserId: saleActor.id,
      }).run()
    }
  }, { behavior: 'immediate' })
}
