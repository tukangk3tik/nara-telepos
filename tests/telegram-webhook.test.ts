import { afterEach, expect, spyOn, test } from 'bun:test'
import { createApp, type AppOptions } from '../src/server/app'
import { telegramConversations, telegramStaff, telegramUpdates, users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

const databases: ReturnType<typeof createTestDatabase>[] = []
afterEach(() => { for (const db of databases.splice(0)) db.$client.close() })

function setup(options: Partial<AppOptions> = {}) {
  const db = createTestDatabase()
  databases.push(db)
  db.insert(users).values([
    { id: 1, name: 'Cashier', email: 'cashier@test', passwordHash: 'unused', role: 'cashier' },
    { id: 2, name: 'Inactive', email: 'inactive@test', passwordHash: 'unused', role: 'admin' },
  ]).run()
  db.insert(telegramStaff).values([
    { userId: 1, telegramUserId: 1001 },
    { userId: 2, telegramUserId: 1002, isActive: false },
  ]).run()
  const sent: Array<{ chatId: string; text: string }> = []
  const app = createApp({
    db, sessionSecret: 'session', telegramEnabled: true, telegramWebhookSecret: 'exact-secret',
    telegramClient: { async sendMessage(chatId, text) { sent.push({ chatId, text }) } },
    ...options,
  })
  const post = (update: unknown, secret: string | null = 'exact-secret') => app.request('/telegram/webhook', {
    method: 'POST', body: typeof update === 'string' ? update : JSON.stringify(update),
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }) },
  })
  return { db, app, post, sent }
}

function message(updateId = 1, userId = 1001, chatType = 'private') {
  return { update_id: updateId, message: {
    message_id: 42, date: 1788566400, from: { id: userId, is_bot: false, first_name: 'Staff' },
    chat: { id: chatType === 'private' ? userId : -100, type: chatType }, text: '/start',
  } }
}

test('checks the exact secret before parsing or claiming an update', async () => {
  const { db, post, sent } = setup()
  for (const secret of [null, 'wrong', 'exact-secret-extra', 'EXACT-SECRET']) {
    expect((await post('{', secret)).status).toBe(403)
  }
  expect(db.select().from(telegramUpdates).all()).toHaveLength(0)
  expect(sent).toHaveLength(0)
})

test('public webhook claims concurrent duplicates once and retains the claim across app instances', async () => {
  const { db, post, sent } = setup()
  const responses = await Promise.all([post(message()), post(message())])
  expect(responses.map((response) => response.status)).toEqual([200, 200])
  expect(sent).toHaveLength(1)
  expect(sent[0]?.chatId).toBe('1001')
  const claim = db.select().from(telegramUpdates).get()!
  expect(claim.updateId).toBe(1)
  expect(claim.processedAt).not.toBeNull()
  const restarted = createApp({ db, sessionSecret: 'session', telegramEnabled: true,
    telegramWebhookSecret: 'exact-secret', telegramClient: { async sendMessage() { throw new Error('duplicate dispatched') } } })
  expect((await restarted.request('/telegram/webhook', { method: 'POST', body: JSON.stringify(message()),
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'exact-secret' } })).status).toBe(200)
  expect(db.select().from(telegramUpdates).get()).toEqual(claim)
})

test('disabled Telegram exposes no webhook even with a configured client', async () => {
  const { post, db } = setup({ telegramEnabled: false })
  expect((await post(message())).status).toBe(404)
  expect(db.select().from(telegramUpdates).all()).toHaveLength(0)
})

test('malformed JSON and invalid update IDs are rejected without claiming or sending', async () => {
  const { db, post, sent } = setup()
  for (const update of ['{', null, [], {}, { update_id: '1' }, { update_id: -1 }, { update_id: 1.5 }, { update_id: 9007199254740992 }]) {
    expect((await post(update)).status).toBe(400)
  }
  expect(db.select().from(telegramUpdates).all()).toHaveLength(0)
  expect(sent).toHaveLength(0)
})

test('unknown, inactive, and group senders receive a safe response without dispatch or draft changes', async () => {
  let dispatched = 0
  const { post, db, sent } = setup({ telegramDispatcher: async () => { dispatched++ } })
  db.insert(telegramConversations).values({ telegramUserId: 1001, chatId: 1001, state: 'sale.review',
    draftJson: '{}', expiresAt: '2099-01-01T00:00:00.000Z' }).run()
  const before = db.select().from(telegramConversations).all()
  expect((await post(message(1, 9999))).status).toBe(200)
  expect((await post(message(2, 1002))).status).toBe(200)
  expect((await post(message(3, 1001, 'group'))).status).toBe(200)
  expect(dispatched).toBe(0)
  expect(sent).toHaveLength(3)
  expect(sent[0]?.text).toMatch(/access|staff/i)
  expect(sent[2]?.text).toMatch(/private/i)
  expect(db.select().from(telegramConversations).all()).toEqual(before)
})

test('callback authorization uses the callback sender and ignores actor fields in payloads and drafts', async () => {
  const actors: unknown[] = []
  const actions: unknown[] = []
  const { post, db } = setup({ telegramDispatcher: async ({ actor, action }) => { actors.push(actor); actions.push(action) } })
  db.insert(telegramConversations).values({ telegramUserId: 1001, chatId: 1001, state: 'sale.review',
    draftJson: '{"actor":{"id":2,"role":"admin"},"createdByUserId":2}', expiresAt: '2099-01-01T00:00:00.000Z' }).run()
  const callback = { update_id: 8, actor: { id: 2, role: 'admin' }, callback_query: {
    id: 'callback-8', from: { id: 1001, is_bot: false, first_name: 'Staff' }, data: 'sale:confirm',
    message: { message_id: 42, date: 1788566400, from: { id: 8888, is_bot: true, first_name: 'Bot' }, chat: { id: 1001, type: 'private' } },
  } }
  expect((await post(callback)).status).toBe(200)
  expect(actors).toEqual([{ id: 1, role: 'cashier' }])
  expect(actions).toEqual([{ type: 'callback', data: 'sale:confirm', callbackQueryId: 'callback-8', messageId: 42 }])
  db.update(telegramStaff).set({ isActive: false }).run()
  expect((await post({ ...callback, update_id: 9 })).status).toBe(200)
  expect(actors).toHaveLength(1)
})

test('unsupported and malformed actions never reach the dispatcher', async () => {
  let dispatched = 0
  const { post } = setup({ telegramDispatcher: async () => { dispatched++ } })
  const base = message()
  const updates = [
    { update_id: 1, edited_message: base.message },
    { update_id: 2, message: { ...base.message, text: undefined } },
    { update_id: 3, message: { ...base.message, from: { id: '1001' } } },
    { update_id: 4, message: { ...base.message, chat: { id: 1002, type: 'private' } } },
    { update_id: 5, callback_query: { id: '5', from: base.message.from, inline_message_id: 'inline', data: 'sale:confirm' } },
    { update_id: 6, callback_query: { id: '6', from: base.message.from, message: { ...base.message, date: 0 }, data: 'sale:confirm' } },
  ]
  for (const update of updates) expect((await post(update)).status).toBe(200)
  expect(dispatched).toBe(0)
})

test('expired drafts are deleted before dispatching a new action', async () => {
  const seen: unknown[] = []
  const { post, db } = setup({ telegramDispatcher: async ({ conversation, db }) => {
    seen.push(conversation)
    expect(db.select().from(telegramConversations).all()).toHaveLength(0)
  } })
  db.insert(telegramConversations).values({ telegramUserId: 1001, chatId: 1001, state: 'sale.review',
    draftJson: '{}', expiresAt: '2000-01-01T00:00:00.000Z' }).run()
  expect((await post(message())).status).toBe(200)
  expect(seen).toEqual([null])
})

test('draft storage replaces one JSON draft per user and handles exact expiry and deletion', async () => {
  const { saveConversation, loadConversation, deleteConversation } = await import('../src/server/telegram/conversations')
  const { db } = setup()
  const now = new Date('2026-09-05T10:00:00.000Z')
  saveConversation(db, '1001', { chatId: '1001', state: 'sale.search', draft: { items: [] }, expiresAt: '2026-09-05T10:30:00.000Z' }, now)
  saveConversation(db, '1001', { chatId: '1001', state: 'expense.amount', draft: { categoryId: 3, notes: 'Taxi 🚕' }, expiresAt: '2026-09-05T10:45:00.000Z' }, now)
  expect(db.select().from(telegramConversations).all()).toHaveLength(1)
  expect(loadConversation(db, '1001', now)).toEqual({ telegramUserId: '1001', chatId: '1001', state: 'expense.amount',
    draft: { categoryId: 3, notes: 'Taxi 🚕' }, expiresAt: '2026-09-05T10:45:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z' })
  expect(loadConversation(db, '1001', new Date('2026-09-05T10:45:00.000Z'))).toBeNull()
  expect(db.select().from(telegramConversations).all()).toHaveLength(0)
  saveConversation(db, '1001', { chatId: '1001', state: 'sale.search', draft: {}, expiresAt: '2026-09-05T10:30:00.000Z' }, now)
  deleteConversation(db, '1001')
  expect(loadConversation(db, '1001', now)).toBeNull()
})

test('corrupt draft JSON or expiry is discarded safely', async () => {
  const { loadConversation } = await import('../src/server/telegram/conversations')
  const { db } = setup()
  for (const values of [
    { draftJson: '{', expiresAt: '2099-01-01T00:00:00.000Z' },
    { draftJson: 'null', expiresAt: '2099-01-01T00:00:00.000Z' },
    { draftJson: '[]', expiresAt: '2099-01-01T00:00:00.000Z' },
    { draftJson: '{}', expiresAt: 'invalid-date' },
  ]) {
    db.insert(telegramConversations).values({ telegramUserId: 1001, chatId: 1001, state: 'sale.review', ...values }).run()
    expect(loadConversation(db, '1001')).toBeNull()
    expect(db.select().from(telegramConversations).all()).toHaveLength(0)
  }
})

test('draft storage rejects invalid IDs, state, expiry, and non-JSON data before replacing a valid draft', async () => {
  const { saveConversation, loadConversation } = await import('../src/server/telegram/conversations')
  const { db } = setup()
  const valid = { chatId: '1001', state: 'sale.search', draft: {}, expiresAt: '2099-01-01T00:00:00.000Z' }
  saveConversation(db, '1001', valid)
  for (const id of ['0', '-1', '1001x', '9007199254740992']) expect(() => saveConversation(db, id, valid)).toThrow()
  for (const change of [{ chatId: '1002' }, { state: '' }, { expiresAt: 'bad' }, { expiresAt: '2000-01-01T00:00:00.000Z' }, { draft: { price: NaN } }]) {
    expect(() => saveConversation(db, '1001', { ...valid, ...change })).toThrow()
  }
  expect(loadConversation(db, '1001')?.state).toBe('sale.search')
})

test('Bot API client posts JSON with a keyboard and rejects sanitized HTTP, API, network, and JSON errors', async () => {
  const { createTelegramClient } = await import('../src/server/telegram/client')
  const requests: Array<{ url: string; init: RequestInit }> = []
  const client = createTelegramClient('bot-token', async (url, init) => {
    requests.push({ url, init })
    return Response.json({ ok: true, result: { message_id: 1, date: 1788566400, chat: { id: 1001, type: 'private' }, text: 'Pick' } })
  })
  const keyboard = { inline_keyboard: [[{ text: 'Pick', callback_data: 'sale:product:1' }]] }
  await client.sendMessage('1001', 'Pick', keyboard)
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe('https://api.telegram.org/botbot-token/sendMessage')
  expect(requests[0]?.init.method).toBe('POST')
  expect(requests[0]?.init.headers).toEqual({ 'content-type': 'application/json' })
  expect(JSON.parse(requests[0]?.init.body as string)).toEqual({ chat_id: '1001', text: 'Pick', reply_markup: keyboard })
  expect(requests[0]?.init.signal).toBeInstanceOf(AbortSignal)
  for (const response of [new Response('bad', { status: 502 }), Response.json({ ok: false, description: 'bot-token' }), new Response('{')]) {
    await expect(createTelegramClient('bot-token', async () => response).sendMessage('1001', 'Hi')).rejects.toThrow('Telegram sendMessage failed')
  }
  await expect(createTelegramClient('bot-token', async () => { throw new Error('https://api.telegram.org/botbot-token/sendMessage') }).sendMessage('1001', 'Hi')).rejects.toThrow('Telegram sendMessage failed')
})

test('a dispatcher failure retains the claim so retries cannot repeat a partial side effect', async () => {
  let attempts = 0
  const { post, db } = setup({ telegramDispatcher: async () => { attempts++; throw new Error('dispatch failure') } })
  expect((await post(message())).status).toBe(500)
  expect((await post(message())).status).toBe(200)
  expect(attempts).toBe(1)
  expect(db.select().from(telegramUpdates).get()?.processedAt).toBeNull()
})

test('enabled Telegram requires a nonempty secret and a token when no client is supplied', () => {
  expect(() => { setup({ telegramWebhookSecret: '' }) }).toThrow()
  expect(() => { setup({ telegramClient: undefined }) }).toThrow()
})

test('a Bot API send failure preserves a saved draft, logs no secret, and acknowledges the update', async () => {
  const { saveConversation } = await import('../src/server/telegram/conversations')
  const logged = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { post, db } = setup({
      telegramClient: { async sendMessage() { throw new Error('https://api.telegram.org/bot-secret/sendMessage') } },
      telegramDispatcher: async ({ db, client, telegramUserId, chatId }) => {
        saveConversation(db, telegramUserId, { chatId, state: 'sale.search', draft: {}, expiresAt: '2099-01-01T00:00:00.000Z' })
        await client.sendMessage(chatId, 'Saved')
      },
    })
    expect((await post(message())).status).toBe(200)
    expect((await post(message())).status).toBe(200)
    expect(db.select().from(telegramConversations).get()?.state).toBe('sale.search')
    expect(db.select().from(telegramUpdates).get()?.processedAt).not.toBeNull()
    expect(logged.mock.calls).toEqual([['Telegram sendMessage failed']])
  } finally { logged.mockRestore() }
})
