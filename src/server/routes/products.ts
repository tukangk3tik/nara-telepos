import { Hono } from 'hono'
import { requireActor, requireRole } from '../auth'
import type { DatabaseClient } from '../db'
import { adjustStock, createProduct, findSaleableProducts, listProducts, updateProduct } from '../services/catalog'

export function createProductRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.get('/', (c) => c.json(c.req.query('all') === 'true' && requireActor(c).role === 'admin' ? listProducts(db) : findSaleableProducts(db, c.req.query('q') ?? '')))
  app.post('/', requireRole('admin'), async (c) => c.json(createProduct(db, await c.req.json().catch(() => ({}))), 201))
  app.put('/:id', requireRole('admin'), async (c) => c.json(updateProduct(db, Number(c.req.param('id')), await c.req.json().catch(() => ({})))))
  app.post('/:id/stock-adjustments', requireRole('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return c.json(adjustStock(db, Number(c.req.param('id')), body.quantityDelta, requireActor(c)))
  })

  return app
}
