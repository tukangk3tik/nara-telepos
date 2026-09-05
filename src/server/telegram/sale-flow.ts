import { and, eq } from 'drizzle-orm'
import { customers, products, telegramConversations } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { Actor, SaleInput } from '../domain/types'
import { createCustomer, findCustomers, findSaleableProducts } from '../services/catalog'
import { createCompletedSale } from '../services/sales'
import { deleteConversation, loadConversation, saveConversation, type TelegramContext } from './conversations'
import { object } from './update'

type SaleDraft = {
  nonce: string
  customerId: number | null
  items: SaleInput['items']
  choices: number[]
  productId: number | null
  paymentMethod: SaleInput['paymentMethod'] | null
}
type Button = [text: string, action: string]
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const paymentMethod = (value: unknown): value is SaleInput['paymentMethod'] => value === 'cash' || value === 'transfer' || value === 'qris'
const label = (text: string) => text.replace(/[\r\n]/g, ' ').slice(0, 100)

function readDraft(value: Record<string, unknown>): SaleDraft | null {
  if (typeof value.nonce !== 'string' || !/^[a-f0-9]{16}$/.test(value.nonce)
    || (value.customerId !== null && !positiveInteger(value.customerId))
    || (value.productId !== null && !positiveInteger(value.productId))
    || (value.paymentMethod !== null && !paymentMethod(value.paymentMethod))
    || !Array.isArray(value.choices) || !value.choices.every(positiveInteger)
    || !Array.isArray(value.items) || value.items.length > 20
    || !value.items.every((item) => object(item) && positiveInteger(item.productId) && positiveInteger(item.quantity))) return null
  return value as SaleDraft
}

export async function handleTelegramSale(context: TelegramContext, actor: Actor = context.actor): Promise<void> {
  const { db, client, telegramUserId, chatId, action } = context
  // Reload here: the context may predate another update's confirmation claim.
  const conversation = loadConversation(db, telegramUserId)
  const text = action.type === 'text' ? action.text.trim() : ''
  let draft = conversation?.state.startsWith('sale.') ? readDraft(conversation.draft) : null
  const send = (message: string) => client.sendMessage(chatId, message)
  const stale = () => send('This button is no longer current. Use the latest prompt or restart with /sale.')
  const prompt = (state: string, message: string, buttons: Button[] = []) => {
    draft!.nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
    saveConversation(db, telegramUserId, { chatId, state, draft: draft!, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() })
    return client.sendMessage(chatId, message, { inline_keyboard: [...buttons, ['Cancel', 'sale:cancel'] as Button]
      .map(([text, action]) => [{ text, callback_data: `${action}:${draft!.nonce}` }]) })
  }
  const searchProducts = () => {
    draft!.choices = []
    draft!.productId = null
    return prompt('sale.productSearch', 'Search products by name, SKU or barcode.')
  }
  const review = (error = '') => {
    const lines = draft!.items.map(({ productId, quantity }) => {
      const product = db.select().from(products).where(eq(products.id, productId)).get()
      if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found. Cancel and restart with /sale.')
      return { productName: product.name, quantity, unitPrice: product.salePrice, lineTotal: product.salePrice * quantity }
    })
    const customer = draft!.customerId === null ? 'Anonymous' : db.select().from(customers).where(eq(customers.id, draft!.customerId)).get()?.name ?? 'Customer unavailable'
    return prompt('sale.confirm', [error, 'Review sale', `Customer: ${label(customer)}`,
      ...lines.map((line) => `${label(line.productName)}: ${line.quantity} × ${line.unitPrice} = ${line.lineTotal}`),
      `Total: ${lines.reduce((sum, line) => sum + line.lineTotal, 0)}`, `Payment: ${draft!.paymentMethod}`, 'Confirm to complete this sale.'].filter(Boolean).join('\n'), [['Confirm', 'sale:confirm']])
  }

  if (conversation?.state === 'sale.committing') {
    await send('This sale confirmation is already being processed. Check sales before starting another sale.')
    return
  }
  if (text === '/sale') {
    draft = { nonce: '', customerId: null, items: [], choices: [], productId: null, paymentMethod: null }
    await prompt('sale.customer', 'Search customers by name, phone or email, create a customer, or choose Anonymous.', [
      ['New customer', 'sale:customer:new'], ['Anonymous', 'sale:customer:none'],
    ])
    return
  }
  if (text === '/cancel') {
    deleteConversation(db, telegramUserId)
    await send('Draft cancelled. Start with /sale.')
    return
  }
  if (!draft || !conversation) { await stale(); return }

  let callback = ''
  if (action.type === 'callback') {
    const parts = action.data.split(':')
    if (parts.pop() !== draft.nonce) { await stale(); return }
    callback = parts.join(':')
  }
  if (callback === 'sale:cancel') {
    deleteConversation(db, telegramUserId)
    await send('Draft cancelled. Start with /sale.')
    return
  }

  try {
    if (conversation.state === 'sale.customer') {
      if (callback === 'sale:customer:new') {
        await prompt('sale.customerCreate', 'Send the new customer name.')
        return
      }
      if (callback === 'sale:customer:none') { await searchProducts(); return }
      const id = Number(callback.match(/^sale:customer:(\d+)$/)?.[1])
      if (positiveInteger(id) && draft.choices.includes(id)) {
        draft.customerId = id
        await searchProducts()
        return
      }
      if (text && !text.startsWith('/')) {
        const found = findCustomers(db, text).slice(0, 10)
        draft.choices = found.map((customer) => customer.id)
        await prompt('sale.customer', found.length ? 'Select a customer (up to 10 results). Refine your search if needed.' : 'No customers found. Search again or create a customer.', [
          ...found.map((customer): Button => [label(customer.name), `sale:customer:${customer.id}`]),
          ['New customer', 'sale:customer:new'], ['Anonymous', 'sale:customer:none'],
        ])
        return
      }
    } else if (conversation.state === 'sale.customerCreate' && text && !text.startsWith('/')) {
      draft.customerId = createCustomer(db, { name: text }, actor).id
      await searchProducts()
      return
    } else if (conversation.state === 'sale.productSearch') {
      if (callback === 'sale:items:more') { await searchProducts(); return }
      if (callback === 'sale:items:done' && draft.items.length) {
        await prompt('sale.payment', 'Choose payment method.', [['Cash', 'sale:payment:cash'], ['Transfer', 'sale:payment:transfer'], ['QRIS', 'sale:payment:qris']])
        return
      }
      const id = Number(callback.match(/^sale:product:(\d+)$/)?.[1])
      if (positiveInteger(id) && draft.choices.includes(id)) {
        draft.productId = id
        await prompt('sale.quantity', 'Send quantity as a positive integer.')
        return
      }
      if (text && !text.startsWith('/')) {
        // ponytail: reuse catalog search and cap displayed results; add SQL limits if catalog size requires it.
        const found = findSaleableProducts(db, text).slice(0, 10)
        draft.choices = found.map((product) => product.id)
        await prompt('sale.productSearch', found.length ? 'Select a product (up to 10 results). Refine your search if needed.' : 'No products found. Search by name, SKU or barcode.',
          found.map((product) => [`${label(product.name)} (${label(product.sku)}): ${product.salePrice}, stock ${product.stockQuantity}`, `sale:product:${product.id}`]))
        return
      }
    } else if (conversation.state === 'sale.quantity' && text) {
      const quantity = /^\d+$/.test(text) ? Number(text) : NaN
      if (!positiveInteger(quantity)) { await send('Quantity must be a positive integer. Try again.'); return }
      if (!draft.productId) { await stale(); return }
      const existing = draft.items.find((item) => item.productId === draft!.productId)
      if (existing) {
        if (!Number.isSafeInteger(existing.quantity + quantity)) { await send('Quantity is too large. Enter a smaller positive integer.'); return }
        existing.quantity += quantity
      } else {
        if (draft.items.length >= 20) { await send('Maximum 20 different products per sale. Cancel and restart if needed.'); return }
        draft.items.push({ productId: draft.productId, quantity })
      }
      draft.productId = null
      draft.choices = []
      await prompt('sale.productSearch', 'Item added. Add another product or continue to payment.', [['Add more', 'sale:items:more'], ['Continue', 'sale:items:done']])
      return
    } else if (conversation.state === 'sale.payment') {
      const method = callback.replace(/^sale:payment:/, '')
      if (paymentMethod(method)) { draft.paymentMethod = method; await review(); return }
    } else if (conversation.state === 'sale.confirm' && callback === 'sale:confirm' && draft.paymentMethod) {
      const sameDraft = and(eq(telegramConversations.telegramUserId, Number(telegramUserId)), eq(telegramConversations.draftJson, JSON.stringify(conversation.draft)))
      const claimed = db.update(telegramConversations).set({ state: 'sale.committing' })
        .where(and(sameDraft, eq(telegramConversations.state, 'sale.confirm'))).returning().get()
      if (!claimed) { await stale(); return }
      try {
        // Durable claim prevents duplicate sales even if delivery fails or the process stops after commit.
        const receipt = await createCompletedSale(db, { source: 'telegram', paymentMethod: draft.paymentMethod,
          ...(draft.customerId === null ? {} : { customerId: draft.customerId }), items: draft.items }, actor)
        db.delete(telegramConversations).where(and(sameDraft, eq(telegramConversations.state, 'sale.committing'))).run()
        await send([receipt.invoiceNumber, ...receipt.lines.map((line) => `${label(line.productName)}: ${line.quantity} × ${line.unitPrice} = ${line.lineTotal}`),
          `Total: ${receipt.totalAmount}`, `Payment: ${receipt.paymentMethod}`].join('\n'))
      } catch (error) {
        if (!(error instanceof DomainError)) throw error
        // Validation rolled back the sale; release the claim before rebuilding a fallible review.
        db.update(telegramConversations).set({ state: 'sale.confirm' })
          .where(and(sameDraft, eq(telegramConversations.state, 'sale.committing'))).run()
        if (error.code === 'PRODUCT_NOT_FOUND') await prompt('sale.confirm', `${error.message}. Cancel and restart with /sale.`)
        else await review(error.message)
      }
      return
    }
    await stale()
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    await send(error.message)
  }
}
