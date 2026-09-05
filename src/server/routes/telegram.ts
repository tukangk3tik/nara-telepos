import { Hono } from 'hono'
import type { DatabaseClient } from '../db'
import { findActiveTelegramStaff } from '../services/staff'
import type { TelegramClient } from '../telegram/client'
import { dispatchConversation, loadConversation, type TelegramDispatcher } from '../telegram/conversations'
import { claimUpdate, markUpdateProcessed, object, readTelegramMessage } from '../telegram/update'

export function createTelegramRoutes({ db, appBaseUrl, webhookSecret, client, dispatch = dispatchConversation }: {
  db: DatabaseClient
  appBaseUrl: string
  webhookSecret: string
  client: TelegramClient
  dispatch?: TelegramDispatcher
}) {
  const routes = new Hono()
  const safeClient: TelegramClient = {
    async sendMessage(...args) {
      try { await client.sendMessage(...args) } catch { console.error('Telegram sendMessage failed') }
    },
  }

  routes.post('/webhook', async (c) => {
    if (!webhookSecret || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) return c.json({ error: 'FORBIDDEN' }, 403)
    let update: Record<string, unknown> | null
    try { update = object(await c.req.json()) } catch { return c.json({ error: 'INVALID_UPDATE' }, 400) }
    if (!update || typeof update.update_id !== 'number' || !Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      return c.json({ error: 'INVALID_UPDATE' }, 400)
    }
    if (!await claimUpdate(db, update.update_id)) return c.json({ ok: true })

    // ponytail: durable at-most-once claims; failures require a new action, not a replay of possible business writes.
    const message = readTelegramMessage(update)
    if (message) {
      const { telegramUserId, chatId, action } = message
      if (!message.privateChat) {
        await safeClient.sendMessage(chatId, 'Use a private chat with this bot.')
      } else {
        const actor = findActiveTelegramStaff(db, telegramUserId)
        if (!actor) {
          await safeClient.sendMessage(chatId, 'Access requires an active staff link. Contact your administrator.')
        } else {
          const conversation = loadConversation(db, telegramUserId)
          if (!action) await safeClient.sendMessage(chatId, 'Send text or use a current button. Restart with /sale or /expense if needed.')
          else await dispatch({ db, appBaseUrl, client: safeClient, actor, telegramUserId, chatId, action, conversation })
        }
      }
    }
    markUpdateProcessed(db, update.update_id)
    return c.json({ ok: true })
  })
  return routes
}
