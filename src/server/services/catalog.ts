import { and, asc, eq, like, or, sql } from 'drizzle-orm'
import type { Actor } from '../domain/types'
import { DomainError } from '../domain/errors'
import type { DatabaseClient } from '../db'
import { customers, expenseCategories, products, stockMovements } from '../db/schema'

export type ProductSummary = { id: number; name: string; sku: string; barcode: string | null; salePrice: number; stockQuantity: number }
export type CustomerInput = { name: unknown; phone?: unknown; email?: unknown }
type ProductInput = { name: unknown; sku: unknown; barcode?: unknown; salePrice: unknown; stockQuantity: unknown; isActive?: unknown }

const invalid = (message: string) => { throw new DomainError('INVALID_INPUT', message) }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const optionalText = (value: unknown) => text(value) || null
const positiveId = (value: number) => Number.isSafeInteger(value) && value > 0 ? value : invalid('Invalid ID')
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : invalid('Expected an integer')
const optionalBoolean = (value: unknown): boolean | undefined => value === undefined ? undefined : typeof value === 'boolean' ? value : invalid('Invalid state')
const timestamp = sql`CURRENT_TIMESTAMP`

function productValues(input: ProductInput) {
  const name = text(input.name)
  const sku = text(input.sku)
  const salePrice = integer(input.salePrice)
  const stockQuantity = integer(input.stockQuantity)
  const isActive = optionalBoolean(input.isActive)
  if (!name || !sku || salePrice < 0 || stockQuantity < 0) invalid('Invalid product')
  return { name, sku, barcode: optionalText(input.barcode), salePrice, stockQuantity, ...(isActive === undefined ? {} : { isActive }) }
}

export function findSaleableProducts(db: DatabaseClient, query = ''): ProductSummary[] {
  const search = text(query)
  const fields = { id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, salePrice: products.salePrice, stockQuantity: products.stockQuantity }
  const where = search
    ? and(eq(products.isActive, true), or(like(products.name, `%${search}%`), like(products.sku, `%${search}%`), like(products.barcode, `%${search}%`)))
    : eq(products.isActive, true)
  return db.select(fields).from(products).where(where).orderBy(asc(products.name)).all()
}

export function listProducts(db: DatabaseClient) {
  return db.select().from(products).orderBy(asc(products.name)).all()
}

export function createProduct(db: DatabaseClient, input: ProductInput) {
  return db.insert(products).values(productValues(input)).returning().get()
}

export function updateProduct(db: DatabaseClient, id: number, input: Partial<ProductInput>) {
  positiveId(id)
  const existing = db.select().from(products).where(eq(products.id, id)).get()
  if (!existing) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found')
  return db.update(products).set({
    ...productValues({ ...existing, ...input }),
    updatedAt: timestamp,
  }).where(eq(products.id, id)).returning().get()
}

export function adjustStock(db: DatabaseClient, productId: number, quantityDelta: unknown, actor: Actor) {
  positiveId(productId)
  if (actor.role !== 'admin') throw new DomainError('FORBIDDEN', 'Administrator access required')
  const delta = integer(quantityDelta)
  if (!delta) invalid('Stock adjustment must not be zero')

  return db.transaction((tx) => {
    const product = tx.select().from(products).where(eq(products.id, productId)).get()
    if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found')
    const stockQuantity = product.stockQuantity + delta
    if (stockQuantity < 0) invalid('Stock cannot be negative')
    const updated = tx.update(products).set({ stockQuantity, updatedAt: timestamp }).where(eq(products.id, productId)).returning().get()
    tx.insert(stockMovements).values({
      productId,
      quantityDelta: delta,
      reason: 'adjustment',
      referenceType: 'product',
      referenceId: productId,
      createdByUserId: actor.id,
    }).run()
    return updated
  }, { behavior: 'immediate' })
}

export function createCustomer(db: DatabaseClient, input: CustomerInput, _actor: Actor) {
  const name = text(input.name)
  if (!name) invalid('Customer name is required')
  return db.insert(customers).values({ name, phone: optionalText(input.phone), email: optionalText(input.email) }).returning().get()
}

export function findCustomers(db: DatabaseClient, query = '') {
  const search = text(query)
  const where = search ? or(like(customers.name, `%${search}%`), like(customers.phone, `%${search}%`), like(customers.email, `%${search}%`)) : undefined
  return db.select().from(customers).where(where).orderBy(asc(customers.name)).all()
}

export function updateCustomer(db: DatabaseClient, id: number, input: CustomerInput, _actor: Actor) {
  positiveId(id)
  const name = text(input.name)
  if (!name) invalid('Customer name is required')
  const customer = db.update(customers).set({ name, phone: optionalText(input.phone), email: optionalText(input.email), updatedAt: timestamp }).where(eq(customers.id, id)).returning().get()
  if (!customer) throw new DomainError('CUSTOMER_NOT_FOUND', 'Customer not found')
  return customer
}

export function listExpenseCategories(db: DatabaseClient, activeOnly = false) {
  return db.select().from(expenseCategories).where(activeOnly ? eq(expenseCategories.isActive, true) : undefined).orderBy(asc(expenseCategories.name)).all()
}

export function createExpenseCategory(db: DatabaseClient, name: unknown) {
  const value = text(name)
  if (!value) invalid('Category name is required')
  return db.insert(expenseCategories).values({ name: value }).returning().get()
}

export function updateExpenseCategory(db: DatabaseClient, id: number, input: { name?: unknown; isActive?: unknown }) {
  positiveId(id)
  const existing = db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).get()
  if (!existing) throw new DomainError('EXPENSE_CATEGORY_NOT_FOUND', 'Expense category not found')
  const name = input.name === undefined ? existing.name : text(input.name)
  const isActive = optionalBoolean(input.isActive)
  if (!name) invalid('Invalid expense category')
  return db.update(expenseCategories).set({ name, ...(isActive === undefined ? {} : { isActive }), updatedAt: timestamp }).where(eq(expenseCategories.id, id)).returning().get()
}
