export type InlineKeyboardMarkup = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }

export type TelegramClient = {
  sendMessage(chatId: string, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>
}

export async function checkTelegramBot(token: string, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok || (await response.json() as { ok?: unknown } | null)?.ok !== true) throw new Error()
  } catch {
    throw new Error('Telegram check failed')
  }
}

export function createTelegramClient(
  token: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): TelegramClient {
  return {
    async sendMessage(chatId, text, replyMarkup) {
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup && { reply_markup: replyMarkup }) }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok || (await response.json() as { ok?: unknown } | null)?.ok !== true) throw new Error()
      } catch {
        // Network errors can contain the URL, including the bot token.
        throw new Error('Telegram sendMessage failed')
      }
    },
  }
}
