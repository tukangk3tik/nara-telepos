import { and, eq } from 'drizzle-orm'
import { telegramConversations } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { Actor } from '../domain/types'
import { listExpenseCategories } from '../services/catalog'
import { createExpense } from '../services/expenses'
import { deleteConversation, loadConversation, saveConversation, type TelegramContext } from './conversations'

type ExpenseDraft = { nonce: string; categoryId: number | null; choices: number[]; amount: number | null; notes: string }
type Button = [text: string, action: string]
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const label = (text: string) => text.replace(/[\r\n]/g, ' ').slice(0, 100)
const today = () => new Date().toISOString().slice(0, 10)

function readDraft(value: Record<string, unknown>): ExpenseDraft | null {
  if (typeof value.nonce !== 'string' || !/^[a-f0-9]{16}$/.test(value.nonce)
    || (value.categoryId !== null && !positiveInteger(value.categoryId))
    || (value.amount !== null && !positiveInteger(value.amount))
    || !Array.isArray(value.choices) || !value.choices.every(positiveInteger)
    || typeof value.notes !== 'string' || value.notes.length > 1000) return null
  return value as ExpenseDraft
}

export async function handleTelegramExpense(context: TelegramContext, actor: Actor = context.actor): Promise<void> {
  const { db, client, telegramUserId, chatId, action } = context
  // Reload because another update may already have claimed confirmation.
  const conversation = loadConversation(db, telegramUserId)
  const text = action.type === 'text' ? action.text.trim() : ''
  let draft = conversation?.state.startsWith('expense.') ? readDraft(conversation.draft) : null
  const send = (message: string) => client.sendMessage(chatId, message)
  const stale = () => send('This button is no longer current. Use the latest prompt or restart with /expense.')
  const prompt = (state: string, message: string, buttons: Button[] = []) => {
    draft!.nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
    saveConversation(db, telegramUserId, { chatId, state, draft: draft!, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() })
    return client.sendMessage(chatId, message, { inline_keyboard: [...buttons, ['Cancel', 'expense:cancel'] as Button]
      .map(([text, action]) => [{ text, callback_data: `${action}:${draft!.nonce}` }]) })
  }
  const review = () => {
    const category = listExpenseCategories(db).find((category) => category.id === draft!.categoryId)
    return prompt('expense.confirm', ['Review expense', `Category: ${label(category?.name ?? 'Unavailable')}`,
      `Amount: IDR ${draft!.amount}`, `Notes: ${draft!.notes || '(none)'}`, `Date: ${today()} (server date at confirmation)`,
      'Confirm to record this expense.'].join('\n'), [['Confirm', 'expense:confirm']])
  }

  if (conversation?.state === 'expense.committing') {
    await send('This expense confirmation is already being processed. Check expenses before starting another expense.')
    return
  }
  if (text === '/expense') {
    const categories = listExpenseCategories(db, true)
    draft = { nonce: '', categoryId: null, choices: categories.map((category) => category.id), amount: null, notes: '' }
    await prompt('expense.category', categories.length ? 'Choose an expense category.' : 'No active expense categories. Contact your administrator, then restart with /expense.',
      categories.map((category) => [label(category.name), `expense:category:${category.id}`]))
    return
  }
  if (text === '/cancel') {
    deleteConversation(db, telegramUserId)
    await send('Draft cancelled. Start with /expense.')
    return
  }
  if (!draft || !conversation) { await stale(); return }

  let callback = ''
  if (action.type === 'callback') {
    const parts = action.data.split(':')
    if (parts.pop() !== draft.nonce) { await stale(); return }
    callback = parts.join(':')
  }
  if (callback === 'expense:cancel') {
    deleteConversation(db, telegramUserId)
    await send('Draft cancelled. Start with /expense.')
    return
  }

  if (conversation.state === 'expense.category') {
    const id = Number(callback.match(/^expense:category:(\d+)$/)?.[1])
    if (positiveInteger(id) && draft.choices.includes(id)) {
      if (!listExpenseCategories(db, true).some((category) => category.id === id)) {
        await send('Expense category is no longer active. Restart with /expense to choose an active category.')
        return
      }
      draft.categoryId = id
      await prompt('expense.amount', 'Send the amount in IDR as a positive integer, without separators.')
      return
    }
  } else if (conversation.state === 'expense.amount' && text) {
    const amount = /^\d+$/.test(text) ? Number(text) : NaN
    if (!positiveInteger(amount)) { await send('Amount must be a positive integer in IDR. Try again.'); return }
    draft.amount = amount
    await prompt('expense.notes', 'Send an optional note (up to 1000 characters), or skip.', [['Skip', 'expense:notes:skip']])
    return
  } else if (conversation.state === 'expense.notes' && (callback === 'expense:notes:skip' || (text && !text.startsWith('/')))) {
    if (text.length > 1000) { await send('Notes must be at most 1000 characters. Try again or skip.'); return }
    draft.notes = text
    await review()
    return
  } else if (conversation.state === 'expense.confirm' && callback === 'expense:confirm' && draft.categoryId && draft.amount) {
    const sameDraft = and(eq(telegramConversations.telegramUserId, Number(telegramUserId)), eq(telegramConversations.draftJson, JSON.stringify(conversation.draft)))
    const claimed = db.update(telegramConversations).set({ state: 'expense.committing' })
      .where(and(sameDraft, eq(telegramConversations.state, 'expense.confirm'))).returning().get()
    if (!claimed) { await stale(); return }
    try {
      // Durable claim prevents duplicate expenses after concurrent updates or interrupted delivery.
      const receipt = await createExpense(db, { expenseCategoryId: draft.categoryId, amount: draft.amount,
        transactionDate: today(), notes: draft.notes, source: 'telegram' }, actor)
      db.delete(telegramConversations).where(and(sameDraft, eq(telegramConversations.state, 'expense.committing'))).run()
      await send([receipt.expenseNumber, `Category: ${label(receipt.categoryName)}`, `Amount: IDR ${receipt.amount}`, `Date: ${receipt.transactionDate}`].join('\n'))
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      db.update(telegramConversations).set({ state: 'expense.confirm' })
        .where(and(sameDraft, eq(telegramConversations.state, 'expense.committing'))).run()
      await prompt('expense.confirm', `${error.message}. Cancel or restart with /expense.`)
    }
    return
  }
  await stale()
}
