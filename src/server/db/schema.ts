import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const createdAt = (name = 'created_at') => text(name).notNull().default(sql`(CURRENT_TIMESTAMP)`)
const updatedAt = () => text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'cashier'] }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('users_email_unique').on(table.email)])

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sku: text('sku').notNull(),
  barcode: text('barcode'),
  salePrice: integer('sale_price').notNull(),
  stockQuantity: integer('stock_quantity').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('products_sku_unique').on(table.sku),
  uniqueIndex('products_barcode_unique').on(table.barcode),
])

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sales = sqliteTable('sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceNumber: text('invoice_number').notNull(),
  customerId: integer('customer_id').references(() => customers.id),
  paymentMethod: text('payment_method', { enum: ['cash', 'transfer', 'qris'] }).notNull(),
  subtotalAmount: integer('subtotal_amount').notNull(),
  totalAmount: integer('total_amount').notNull(),
  source: text('source', { enum: ['web', 'telegram'] }).notNull(),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id),
  completedAt: text('completed_at').notNull(),
  cancelledAt: text('cancelled_at'),
  cancelledByUserId: integer('cancelled_by_user_id').references(() => users.id),
  cancellationReason: text('cancellation_reason'),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('sales_invoice_number_unique').on(table.invoiceNumber)])

export const saleItems = sqliteTable('sale_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id').notNull().references(() => sales.id),
  productId: integer('product_id').notNull().references(() => products.id),
  productName: text('product_name').notNull(),
  sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  lineTotal: integer('line_total').notNull(),
})

export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantityDelta: integer('quantity_delta').notNull(),
  reason: text('reason', { enum: ['sale', 'sale_cancellation', 'adjustment'] }).notNull(),
  explanation: text('explanation'),
  referenceType: text('reference_type').notNull(),
  referenceId: integer('reference_id').notNull(),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
})

export const expenseCategories = sqliteTable('expense_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('expense_categories_name_unique').on(table.name)])

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  expenseNumber: text('expense_number').notNull(),
  expenseCategoryId: integer('expense_category_id').notNull().references(() => expenseCategories.id),
  amount: integer('amount').notNull(),
  transactionDate: text('transaction_date').notNull(),
  notes: text('notes'),
  source: text('source', { enum: ['web', 'telegram'] }).notNull(),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('expenses_expense_number_unique').on(table.expenseNumber)])

export const telegramStaff = sqliteTable('telegram_staff', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  telegramUserId: integer('telegram_user_id').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('telegram_staff_user_id_unique').on(table.userId),
  uniqueIndex('telegram_staff_telegram_user_id_unique').on(table.telegramUserId),
])

export const telegramUpdates = sqliteTable('telegram_updates', {
  updateId: integer('update_id').primaryKey(),
  receivedAt: createdAt('received_at'),
  processedAt: text('processed_at'),
})

export const telegramConversations = sqliteTable('telegram_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramUserId: integer('telegram_user_id').notNull(),
  chatId: integer('chat_id').notNull(),
  state: text('state').notNull(),
  draftJson: text('draft_json').notNull(),
  expiresAt: text('expires_at').notNull(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('telegram_conversations_telegram_user_id_unique').on(table.telegramUserId)])

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  storeName: text('store_name').notNull().default(''),
  receiptFooter: text('receipt_footer').notNull().default(''),
}, (table) => [check('app_settings_id_one', sql`${table.id} = 1`)])

export const schema = {
  users,
  products,
  customers,
  sales,
  saleItems,
  stockMovements,
  expenseCategories,
  expenses,
  telegramStaff,
  telegramUpdates,
  telegramConversations,
  appSettings,
}
