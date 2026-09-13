import { afterEach, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/server/app'
import { expenseCategories, expenses, products, sales, stockMovements, telegramConversations, telegramStaff, users } from '../src/server/db/schema'
import type { InlineKeyboardMarkup } from '../src/server/telegram/client'
import { serverLocalDate } from '../src/server/telegram/expense-flow'
import { createTestDatabase } from './helpers/database'

const databases: ReturnType<typeof createTestDatabase>[] = []
afterEach(() => { for (const db of databases.splice(0)) db.$client.close() })

test('server-local date keeps Jakarta midnight expense on the new calendar day', () => {
  expect(serverLocalDate(new Date('2026-09-04T17:30:00.000Z'), 'Asia/Jakarta')).toBe('2026-09-05')
})

const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

function setup() {
  const db = createTestDatabase()
  databases.push(db)
  db.insert(users).values({ id: 1, name: 'Cashier', email: 'cashier@test', passwordHash: 'unused', role: 'cashier' }).run()
  db.insert(telegramStaff).values({ userId: 1, telegramUserId: 1001 }).run()
  const category = db.insert(expenseCategories).values({ name: 'Supplies' }).returning().get()!
  db.insert(products).values({ name: 'Coffee', sku: 'COF', salePrice: 15000, stockQuantity: 10 }).run()
  const sent: Array<{ text: string; markup?: InlineKeyboardMarkup }> = []
  const app = createApp({ db, sessionSecret: 'session', telegramEnabled: true, telegramWebhookSecret: 'secret',
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
  const review = async (notes?: string) => {
    await send('/expense')
    await tap(`expense:category:${category.id}`)
    await send('25000')
    if (notes) await send(notes)
    else await tap('expense:notes:skip')
  }
  return { db, category, sent, send, tap, button, draft, review }
}

test('confirmed Telegram expense records one expense without stock movement, only after review', async () => {
  const t = setup()
  await t.review()
  const today = localDate()
  expect(t.db.select().from(expenses).all()).toHaveLength(0)
  expect(t.sent.at(-1)?.text).toContain('Supplies')
  expect(t.sent.at(-1)?.text).toContain('25000')
  expect(t.sent.at(-1)?.text).toContain(today)
  await t.tap('expense:confirm')
  const expense = t.db.select().from(expenses).get()!
  expect(expense).toMatchObject({ expenseCategoryId: t.category.id, amount: 25000, transactionDate: today, notes: null, source: 'telegram', createdByUserId: 1 })
  expect(t.db.select().from(expenses).all()).toHaveLength(1)
  expect(t.db.select().from(stockMovements).all()).toHaveLength(0)
  expect(t.db.select().from(products).get()?.stockQuantity).toBe(10)
  expect(t.db.select().from(sales).all()).toHaveLength(0)
  expect(t.draft()).toBeUndefined()
  expect(t.sent.at(-1)?.text).toContain(expense.expenseNumber)
})

test('concurrent confirmations with distinct updates and old confirmations cannot duplicate expenses', async () => {
  const t = setup()
  await t.review('  Paper bags  ')
  expect(t.sent.at(-1)?.text).toContain('Paper bags')
  const confirm = t.button('expense:confirm')
  await Promise.all([t.send(confirm, true), t.send(confirm, true)])
  expect(t.db.select().from(expenses).all()).toMatchObject([{ notes: 'Paper bags' }])
  expect(t.db.select().from(expenses).all()).toHaveLength(1)
  await t.review()
  const before = t.draft()
  await t.send(confirm, true)
  expect(t.draft()).toEqual(before)
  expect(t.db.select().from(expenses).all()).toHaveLength(1)
})

test('only active listed categories can be selected and a deactivated selection is rejected', async () => {
  const t = setup()
  const inactive = t.db.insert(expenseCategories).values({ name: 'Hidden', isActive: false }).returning().get()!
  await t.send('/expense')
  expect(t.sent.at(-1)?.markup?.inline_keyboard.flat().map((b) => b.text)).not.toContain('Hidden')
  const select = t.button(`expense:category:${t.category.id}`)
  await t.send(select.replace(`category:${t.category.id}:`, `category:${inactive.id}:`), true)
  expect(t.draft()?.state).toBe('expense.category')
  t.db.update(expenseCategories).set({ isActive: false }).where(eq(expenseCategories.id, t.category.id)).run()
  await t.send(select, true)
  expect(t.draft()?.state).toBe('expense.category')
  expect(t.db.select().from(expenses).all()).toHaveLength(0)
})

test('category deactivation at confirmation preserves a cancellable draft without recording expense', async () => {
  const t = setup()
  await t.review()
  t.db.update(expenseCategories).set({ isActive: false }).run()
  await t.tap('expense:confirm')
  expect(t.db.select().from(expenses).all()).toHaveLength(0)
  expect(t.sent.at(-1)?.text).toMatch(/inactive/i)
  expect(t.draft()?.state).toBe('expense.confirm')
  await t.tap('expense:cancel')
  expect(t.draft()).toBeUndefined()
})

test('amount requires positive integer IDR and notes are limited to the shared service maximum', async () => {
  const t = setup()
  await t.send('/expense')
  await t.tap(`expense:category:${t.category.id}`)
  for (const amount of ['0', '-2', '1.5', '2abc', '1e2', '25,000', '9007199254740992']) {
    await t.send(amount)
    expect(t.draft()?.state).toBe('expense.amount')
    expect(t.sent.at(-1)?.text).toMatch(/positive integer/i)
  }
  await t.send('25000')
  await t.send('x'.repeat(1001))
  expect(t.draft()?.state).toBe('expense.notes')
  await t.send('Paper')
  await t.tap('expense:confirm')
  expect(t.db.select().from(expenses).get()?.notes).toBe('Paper')
})

test('expense and sale commands replace drafts, and stale buttons cannot cancel or modify replacements', async () => {
  const t = setup()
  await t.send('/sale')
  const saleCancel = t.button('sale:cancel')
  await t.send('/expense')
  expect(t.draft()?.state).toBe('expense.category')
  const expenseCancel = t.button('expense:cancel')
  const before = t.draft()
  await t.send(saleCancel, true)
  expect(t.draft()).toEqual(before)
  await t.send('/expense')
  const replacement = t.draft()
  await t.send(expenseCancel, true)
  expect(t.draft()).toEqual(replacement)
  await t.send('/cancel')
  expect(t.draft()).toBeUndefined()
  await t.review()
  const confirm = t.button('expense:confirm')
  await t.send('/sale')
  const sale = t.draft()
  await t.send(confirm, true)
  expect(t.draft()).toEqual(sale)
  expect(t.db.select().from(expenses).all()).toHaveLength(0)
})

test('no active categories leaves an explanatory cancellable draft and expired callbacks are safe', async () => {
  const t = setup()
  t.db.update(expenseCategories).set({ isActive: false }).run()
  await t.send('/expense')
  expect(t.sent.at(-1)?.text).toMatch(/no active/i)
  await t.tap('expense:cancel')
  expect(t.draft()).toBeUndefined()
  t.db.update(expenseCategories).set({ isActive: true }).run()
  await t.review()
  const confirm = t.button('expense:confirm')
  t.db.update(telegramConversations).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run()
  await t.send(confirm, true)
  expect(t.draft()).toBeUndefined()
  expect(t.db.select().from(expenses).all()).toHaveLength(0)
})
