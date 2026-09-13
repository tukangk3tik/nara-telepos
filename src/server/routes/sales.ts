import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireActor, requireRole } from '../auth'
import type { DatabaseClient } from '../db'
import { saleItems, sales } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { SaleInput } from '../domain/types'
import { cancelSale, createCompletedSale } from '../services/sales'

const saleId = (value: string) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new DomainError('INVALID_INPUT', 'Invalid sale')
  return id
}

export function createSalesRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    const items = Array.isArray(input.items)
      ? input.items.map((item) => {
        const line = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
        return { productId: line.productId, quantity: line.quantity }
      })
      : input.items
    return c.json(await createCompletedSale(db, {
      source: 'web',
      customerId: input.customerId as number | undefined,
      paymentMethod: input.paymentMethod as SaleInput['paymentMethod'],
      items: items as SaleInput['items'],
    }, requireActor(c)), 201)
  })

  app.get('/', (c) => {
    const actor = requireActor(c)
    return c.json(db.select().from(sales)
      .where(actor.role === 'admin' ? undefined : eq(sales.createdByUserId, actor.id))
      .orderBy(desc(sales.completedAt)).all())
  })

  app.post('/:id/cancel', requireRole('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    await cancelSale(db, saleId(c.req.param('id')), input.reason as string, requireActor(c))
    return c.body(null, 204)
  })

  app.get('/:id', (c) => {
    const actor = requireActor(c)
    const id = saleId(c.req.param('id'))
    const sale = db.select().from(sales).where(actor.role === 'admin'
      ? eq(sales.id, id)
      : and(eq(sales.id, id), eq(sales.createdByUserId, actor.id))).get()
    if (!sale) throw new DomainError('SALE_NOT_FOUND', 'Sale not found')
    return c.json({ ...sale, items: db.select().from(saleItems).where(eq(saleItems.saleId, id)).all() })
  })

  return app
}
