import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../db'
import { telegramConversations } from '../db/schema'
import type { Actor } from '../domain/types'
import type { TelegramClient } from './client'
import { object, type TelegramAction } from './update'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Conversation = {
  telegramUserId: string
  chatId: string
  state: string
  draft: Record<string, JsonValue>
  expiresAt: string
  updatedAt: string
}

export type TelegramContext = {
  db: DatabaseClient
  client: TelegramClient
  actor: Actor
  telegramUserId: string
  chatId: string
  action: TelegramAction
  conversation: Conversation | null
}
export type TelegramDispatcher = (context: TelegramContext) => Promise<void>

function telegramId(value: string): number {
  const id = /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid Telegram user ID')
  return id
}

export function deleteConversation(db: DatabaseClient, telegramUserId: string) {
  db.delete(telegramConversations).where(eq(telegramConversations.telegramUserId, telegramId(telegramUserId))).run()
}

export function loadConversation(db: DatabaseClient, telegramUserId: string, now = new Date()): Conversation | null {
  const row = db.select().from(telegramConversations).where(eq(telegramConversations.telegramUserId, telegramId(telegramUserId))).get()
  if (!row) return null
  let draft: Record<string, unknown> | null = null
  try { draft = object(JSON.parse(row.draftJson)) } catch { /* Discard corrupt persisted drafts. */ }
  if (!draft || !row.state.trim() || row.chatId !== row.telegramUserId || !(Date.parse(row.expiresAt) > now.getTime())) {
    deleteConversation(db, telegramUserId)
    return null
  }
  return { telegramUserId: String(row.telegramUserId), chatId: String(row.chatId), state: row.state,
    draft: draft as Conversation['draft'], expiresAt: row.expiresAt, updatedAt: row.updatedAt }
}

export function saveConversation(
  db: DatabaseClient,
  telegramUserId: string,
  input: Pick<Conversation, 'chatId' | 'state' | 'draft' | 'expiresAt'>,
  now = new Date(),
) {
  const userId = telegramId(telegramUserId)
  const chatId = telegramId(input.chatId)
  if (chatId !== userId || !input.state.trim() || !object(input.draft) || !(Date.parse(input.expiresAt) > now.getTime())) {
    throw new Error('Invalid conversation')
  }
  const draftJson = JSON.stringify(input.draft, (_key, value: unknown) => {
    if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error('Invalid conversation draft')
    }
    return value
  })
  const values = { telegramUserId: userId, chatId, state: input.state, draftJson,
    expiresAt: new Date(input.expiresAt).toISOString(), updatedAt: now.toISOString() }
  db.insert(telegramConversations).values(values)
    .onConflictDoUpdate({ target: telegramConversations.telegramUserId, set: values }).run()
}

// Tasks 9–10 extend this dispatcher with sale and expense states.
export const dispatchConversation: TelegramDispatcher = async ({ client, chatId }) => {
  await client.sendMessage(chatId, 'Start or restart with /sale or /expense.')
}
