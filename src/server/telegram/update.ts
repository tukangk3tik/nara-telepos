import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../db'
import { telegramUpdates } from '../db/schema'

export type TelegramAction =
  | { type: 'text'; text: string; messageId: number }
  | { type: 'callback'; data: string; callbackQueryId: string; messageId: number }

export const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export async function claimUpdate(db: DatabaseClient, updateId: number): Promise<boolean> {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error('Invalid Telegram update ID')
  return db.insert(telegramUpdates).values({ updateId }).onConflictDoNothing().returning({ updateId: telegramUpdates.updateId }).get() !== undefined
}

export function markUpdateProcessed(db: DatabaseClient, updateId: number) {
  db.update(telegramUpdates).set({ processedAt: new Date().toISOString() }).where(eq(telegramUpdates.updateId, updateId)).run()
}

export function readTelegramMessage(update: Record<string, unknown>) {
  const callback = object(update.callback_query)
  if (callback && update.message) return null
  const message = object(callback ? callback.message : update.message)
  const from = object(callback ? callback.from : message?.from)
  const chat = object(message?.chat)
  if (!message || !from || !positiveId(from.id) || from.is_bot !== false || !chat
    || typeof chat.id !== 'number' || !Number.isSafeInteger(chat.id) || chat.id === 0
    || !['private', 'group', 'supergroup', 'channel'].includes(String(chat.type))) return null
  if (chat.type === 'private' && chat.id !== from.id) return null

  let action: TelegramAction | null = null
  if (positiveId(message.message_id)) {
    if (callback && typeof callback.id === 'string' && callback.id && typeof callback.data === 'string'
      && callback.data.length > 0 && new TextEncoder().encode(callback.data).length <= 64 && positiveId(message.date)) {
      action = { type: 'callback', data: callback.data, callbackQueryId: callback.id, messageId: message.message_id }
    } else if (!callback && typeof message.text === 'string' && message.text.trim()) {
      action = { type: 'text', text: message.text, messageId: message.message_id }
    }
  }
  return { telegramUserId: String(from.id), chatId: String(chat.id), privateChat: chat.type === 'private', action }
}
