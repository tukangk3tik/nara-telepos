import { afterEach, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/server/app'
import { customers, products, saleItems, sales, stockMovements, telegramConversations, telegramStaff, users } from '../src/server/db/schema'
import type { InlineKeyboardMarkup } from '../src/server/telegram/client'
import { createTestDatabase } from './helpers/database'

const databases: ReturnType<typeof createTestDatabase>[] = []
afterEach(() => { for (const db of databases.splice(0)) db.$client.close() })

function setup(appBaseUrl = 'https://pos.example.test/') {
  const db = createTestDatabase()
  databases.push(db)
  db.insert(users).values({ id: 1, name: 'Cashier', email: 'cashier@test', passwordHash: 'unused', role: 'cashier' }).run()
  db.insert(telegramStaff).values({ userId: 1, telegramUserId: 1001 }).run()
  const product = db.insert(products).values({ name: 'Coffee', sku: 'COF-1', barcode: '123456', salePrice: 15000, stockQuantity: 10 }).returning().get()!
  const sent: Array<{ text: string; markup?: InlineKeyboardMarkup }> = []
  const app = createApp({ db, appBaseUrl, sessionSecret: 'session', telegramEnabled: true, telegramWebhookSecret: 'secret',
    telegramClient: { async sendMessage(_chatId, text, markup) { sent.push({ text, markup }) } } })
  let updateId = 0
  const send = async (action: string, callback = false) => {
    const id = ++updateId
    const message = { message_id: id, date: 1788566400, from: { id: 1001, is_bot: false }, chat: { id: 1001, type: 'private' }, text: action }
    const update = callback ? { update_id: id, callback_query: { id: String(id), from: message.from, message, data: action } } : { update_id: id, message }
    expect((await app.request('/telegram/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'secret' }, body: JSON.stringify(update) })).status).toBe(200)
  }
  const button = (action: string) => {
    const data = sent.at(-1)?.markup?.inline_keyboard.flat().find((button) => button.callback_data.startsWith(`${action}:`))?.callback_data
    expect(data).toBeDefined()
    return data!
  }
  const tap = (action: string) => send(button(action), true)
  const draft = () => db.select().from(telegramConversations).get()
  const items = async (payment = 'qris') => {
    await send('coffee')
    await tap(`sale:product:${product.id}`)
    await send('2')
    await tap('sale:items:done')
    await tap(`sale:payment:${payment}`)
  }
  const review = async (payment = 'qris') => { await send('/sale'); await tap('sale:customer:none'); await items(payment) }
  return { db, product, sent, send, tap, button, draft, items, review }
}

test('confirmed Telegram sale creates shared snapshots, stock movements, and a receipt only after review', async () => {
  const t = setup()
  await t.review()
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.sent.at(-1)?.text).toMatch(/Anonymous/)
  expect(t.sent.at(-1)?.text).toContain('Coffee')
  expect(t.sent.at(-1)?.text).toContain('15000')
  expect(t.sent.at(-1)?.text).toContain('30000')
  expect(t.sent.at(-1)?.text).toContain('qris')
  for (const message of t.sent) for (const button of message.markup?.inline_keyboard.flat() ?? []) {
    expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64)
    expect(button.callback_data.split(':').slice(0, -1).join(':')).not.toMatch(/15000|30000|price|total/)
  }
  await t.tap('sale:confirm')
  expect(t.db.select().from(sales).all()).toMatchObject([{ source: 'telegram', paymentMethod: 'qris', customerId: null, createdByUserId: 1, totalAmount: 30000 }])
  expect(t.db.select().from(saleItems).all()).toMatchObject([{ productName: 'Coffee', quantity: 2, unitPrice: 15000, lineTotal: 30000 }])
  expect(t.db.select().from(stockMovements).all()).toMatchObject([{ quantityDelta: -2, createdByUserId: 1 }])
  expect(t.db.select().from(products).get()?.stockQuantity).toBe(8)
  expect(t.draft()).toBeUndefined()
  expect(t.sent.at(-1)?.text).toMatch(/INV-/)
  expect(t.sent.at(-1)?.text).toContain('30000')
  expect(t.sent.at(-1)?.text).toContain('https://pos.example.test/sales/1')
})

test('Telegram receipt links support the configured localhost development origin', async () => {
  const t = setup('http://localhost:3000')
  await t.review()
  await t.tap('sale:confirm')
  expect(t.sent.at(-1)?.text).toContain('http://localhost:3000/sales/1')
})

test('concurrent repeated confirms with distinct updates create only one sale and old confirms cannot buy a new draft', async () => {
  const t = setup()
  await t.review()
  const confirm = t.button('sale:confirm')
  await Promise.all([t.send(confirm, true), t.send(confirm, true)])
  expect(t.db.select().from(sales).all()).toHaveLength(1)
  await t.review('cash')
  const before = t.draft()
  await t.send(confirm, true)
  expect(t.db.select().from(sales).all()).toHaveLength(1)
  expect(t.draft()).toEqual(before)
})

test('searches existing customers and records the selected customer with transfer payment', async () => {
  const t = setup()
  const customer = t.db.insert(customers).values({ name: 'Maya', phone: '0812345' }).returning().get()!
  await t.send('/sale')
  await t.send('0812345')
  expect(t.sent.at(-1)?.text).toMatch(/customer/i)
  await t.tap(`sale:customer:${customer.id}`)
  await t.items('transfer')
  expect(t.sent.at(-1)?.text).toContain('Maya')
  await t.tap('sale:confirm')
  expect(t.db.select().from(sales).get()).toMatchObject({ customerId: customer.id, paymentMethod: 'transfer' })
})

test('creates a named customer in the bot and preserves the customer in the sale', async () => {
  const t = setup()
  await t.send('/sale')
  await t.tap('sale:customer:new')
  await t.send('  Maya  ')
  expect(t.db.select().from(customers).all()).toMatchObject([{ name: 'Maya' }])
  await t.items('cash')
  await t.tap('sale:confirm')
  expect(t.db.select().from(sales).get()).toMatchObject({ customerId: t.db.select().from(customers).get()!.id, paymentMethod: 'cash' })
})

test('stock changes retain the review and create no partial sale', async () => {
  const t = setup()
  await t.review()
  t.db.update(products).set({ stockQuantity: 1 }).run()
  await t.tap('sale:confirm')
  expect(t.sent.at(-1)?.text).toMatch(/Insufficient stock/)
  expect(t.draft()?.state).toBe('sale.confirm')
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.db.select().from(saleItems).all()).toHaveLength(0)
  expect(t.db.select().from(stockMovements).all()).toHaveLength(0)
  t.db.update(products).set({ stockQuantity: 10 }).run()
  await t.tap('sale:confirm')
  expect(t.db.select().from(sales).all()).toHaveLength(1)
})

test('a product removed after review keeps the failed draft cancellable', async () => {
  const t = setup()
  await t.review()
  t.db.delete(products).where(eq(products.id, t.product.id)).run()
  await t.tap('sale:confirm')
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.draft()?.state).toBe('sale.confirm')
  expect(t.sent.at(-1)?.text).toMatch(/Product not found/)
  await t.tap('sale:cancel')
  expect(t.draft()).toBeUndefined()
})

test('stock failure followed by a missing review product restores a draft that /cancel can discard', async () => {
  const t = setup()
  const tea = t.db.insert(products).values({ name: 'Tea', sku: 'TEA-1', salePrice: 10000, stockQuantity: 5 }).returning().get()!
  await t.send('/sale')
  await t.tap('sale:customer:none')
  await t.send('coffee')
  await t.tap(`sale:product:${t.product.id}`)
  await t.send('2')
  await t.tap('sale:items:more')
  await t.send('tea')
  await t.tap(`sale:product:${tea.id}`)
  await t.send('1')
  await t.tap('sale:items:done')
  await t.tap('sale:payment:cash')
  t.db.update(products).set({ stockQuantity: 1 }).where(eq(products.id, t.product.id)).run()
  t.db.delete(products).where(eq(products.id, tea.id)).run()
  await t.tap('sale:confirm')
  expect(t.draft()?.state).toBe('sale.confirm')
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.db.select().from(saleItems).all()).toHaveLength(0)
  expect(t.db.select().from(stockMovements).all()).toHaveLength(0)
  await t.send('/cancel')
  expect(t.draft()).toBeUndefined()
})

test('cancel and replacement discard only the draft and stale buttons cannot change its replacement', async () => {
  const t = setup()
  await t.review()
  const cancel = t.button('sale:cancel')
  await t.send('/sale')
  expect(t.draft()?.state).toBe('sale.customer')
  const before = t.draft()
  await t.send(cancel, true)
  expect(t.draft()).toEqual(before)
  await t.send('/cancel')
  expect(t.draft()).toBeUndefined()
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.db.select().from(products).get()?.stockQuantity).toBe(10)
  await t.send('/sale')
  await t.tap('sale:cancel')
  expect(t.draft()).toBeUndefined()
})

test('product search supports name, SKU and barcode, bounds results and rejects stale or unlisted selections', async () => {
  const t = setup()
  t.db.insert(products).values(Array.from({ length: 15 }, (_, i) => ({ name: `Coffee ${i}`, sku: `EXTRA-${i}`, salePrice: 100, stockQuantity: 10 }))).run()
  const inactive = t.db.insert(products).values({ name: 'Hidden', sku: 'HIDDEN', salePrice: 1, stockQuantity: 1, isActive: false }).returning().get()!
  await t.send('/sale')
  await t.tap('sale:customer:none')
  await t.send('coffee')
  expect(t.sent.at(-1)?.markup?.inline_keyboard.flat().filter((b) => b.callback_data.startsWith('sale:product:')).length).toBeLessThanOrEqual(10)
  const old = t.button(`sale:product:${t.product.id}`)
  await t.send('COF-1')
  const before = t.draft()
  await t.send(old, true)
  expect(t.draft()).toEqual(before)
  await t.send('123456')
  const current = t.button(`sale:product:${t.product.id}`)
  await t.send(current.replace(`product:${t.product.id}:`, `product:${inactive.id}:`), true)
  expect(t.draft()?.state).toBe('sale.productSearch')
  await t.send(current, true)
  expect(t.draft()?.state).toBe('sale.quantity')
})

test('quantity requires a positive safe integer and adding the same product merges quantities', async () => {
  const t = setup()
  await t.send('/sale')
  await t.tap('sale:customer:none')
  await t.send('coffee')
  await t.tap(`sale:product:${t.product.id}`)
  for (const quantity of ['0', '-2', '1.5', '2abc', '1e2', '9007199254740992']) {
    await t.send(quantity)
    expect(t.draft()?.state).toBe('sale.quantity')
    expect(t.sent.at(-1)?.text).toMatch(/positive integer/i)
  }
  await t.send('2')
  await t.tap('sale:items:more')
  await t.send('coffee')
  await t.tap(`sale:product:${t.product.id}`)
  await t.send('1')
  await t.tap('sale:items:done')
  await t.tap('sale:payment:cash')
  await t.tap('sale:confirm')
  expect(t.db.select().from(saleItems).all()).toMatchObject([{ quantity: 3, lineTotal: 45000 }])
})
