import { eq } from 'drizzle-orm'
import { createDatabase, type DatabaseClient } from './db'
import { customers, expenseCategories, products, users } from './db/schema'
import { createExpense } from './services/expenses'
import { createCompletedSale } from './services/sales'
import { loadConfig } from './config'

const demoCustomer = { name: 'Demo Customer', email: 'demo.customer@example.test', phone: '0800000000' }
const demoProduct = { name: 'Demo Coffee', sku: 'DEMO-COFFEE', salePrice: 15000, stockQuantity: 10000 }
const demoCategory = 'Demo supplies'

function firstOrCreate<T>(value: T | undefined, create: () => T): T {
  return value ?? create()
}

export async function seedDemo(db: DatabaseClient) {
  const admin = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.role, 'admin')).get()
  if (!admin) throw new Error('Create an administrator before seeding demo data')

  const product = firstOrCreate(
    db.select({ id: products.id }).from(products).where(eq(products.sku, demoProduct.sku)).get(),
    () => db.insert(products).values(demoProduct).returning({ id: products.id }).get()!,
  )
  const category = firstOrCreate(
    db.select({ id: expenseCategories.id }).from(expenseCategories).where(eq(expenseCategories.name, demoCategory)).get(),
    () => db.insert(expenseCategories).values({ name: demoCategory }).returning({ id: expenseCategories.id }).get()!,
  )
  const customer = firstOrCreate(
    db.select({ id: customers.id }).from(customers).where(eq(customers.email, demoCustomer.email)).get(),
    () => db.insert(customers).values(demoCustomer).returning({ id: customers.id }).get()!,
  )
  const actor = { id: admin.id, role: admin.role }
  const today = new Date().toISOString().slice(0, 10)

  await createCompletedSale(db, { source: 'web', paymentMethod: 'cash', customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] }, actor)
  await createCompletedSale(db, { source: 'web', paymentMethod: 'qris', items: [{ productId: product.id, quantity: 2 }] }, actor)
  await createExpense(db, { source: 'web', expenseCategoryId: category.id, amount: 25000, transactionDate: today, notes: 'Demo supplies' }, actor)
  await createExpense(db, { source: 'web', expenseCategoryId: category.id, amount: 15000, transactionDate: today, notes: 'Demo delivery' }, actor)
}

if (import.meta.main) {
  await seedDemo(createDatabase(loadConfig(process.env).databaseUrl))
  console.log('Added demo sales and expenses')
}
