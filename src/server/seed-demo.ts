import { eq } from 'drizzle-orm'
import { createDatabase, type DatabaseClient } from './db'
import { customers, expenseCategories, products, users } from './db/schema'
import { createExpenseSync } from './services/expenses'
import { createCompletedSaleSync } from './services/sales'
import { loadConfig } from './config'

const demoCustomer = { name: 'Demo Customer', email: 'demo.customer@example.test', phone: '0800000000' }
const demoProduct = { name: 'Demo Coffee', sku: 'DEMO-COFFEE', salePrice: 15000, stockQuantity: 10000 }
const demoCategory = 'Demo supplies'

function firstOrCreate<T>(value: T | undefined, create: () => T): T {
  return value ?? create()
}

export async function seedDemo(db: DatabaseClient) {
  db.transaction((tx) => {
    const admin = tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.role, 'admin')).get()
    if (!admin) throw new Error('Create an administrator before seeding demo data')

    const product = firstOrCreate(
      tx.select({ id: products.id }).from(products).where(eq(products.sku, demoProduct.sku)).get(),
      () => tx.insert(products).values(demoProduct).returning({ id: products.id }).get()!,
    )
    const category = firstOrCreate(
      tx.select({ id: expenseCategories.id }).from(expenseCategories).where(eq(expenseCategories.name, demoCategory)).get(),
      () => tx.insert(expenseCategories).values({ name: demoCategory }).returning({ id: expenseCategories.id }).get()!,
    )
    const customer = firstOrCreate(
      tx.select({ id: customers.id }).from(customers).where(eq(customers.email, demoCustomer.email)).get(),
      () => tx.insert(customers).values(demoCustomer).returning({ id: customers.id }).get()!,
    )
    const actor = { id: admin.id, role: admin.role }
    const today = new Date().toISOString().slice(0, 10)

    createCompletedSaleSync(tx, { source: 'web', paymentMethod: 'cash', customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] }, actor)
    createCompletedSaleSync(tx, { source: 'web', paymentMethod: 'qris', items: [{ productId: product.id, quantity: 2 }] }, actor)
    createExpenseSync(tx, { source: 'web', expenseCategoryId: category.id, amount: 25000, transactionDate: today, notes: 'Demo supplies' }, actor)
    createExpenseSync(tx, { source: 'web', expenseCategoryId: category.id, amount: 15000, transactionDate: today, notes: 'Demo delivery' }, actor)
  }, { behavior: 'immediate' })
}

if (import.meta.main) {
  await seedDemo(createDatabase(loadConfig(process.env).databaseUrl))
  console.log('Added demo sales and expenses')
}
