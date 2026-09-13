import { Hono } from 'hono'
import { requireActor, requireRole } from '../auth'
import type { DatabaseClient } from '../db'
import { createCustomer, findCustomers, updateCustomer } from '../services/catalog'

export function createCustomerRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.get('/', (c) => c.json(findCustomers(db, c.req.query('q') ?? '')))
  app.post('/', async (c) => c.json(createCustomer(db, await c.req.json().catch(() => ({})), requireActor(c)), 201))
  app.put('/:id', requireRole('admin'), async (c) => c.json(updateCustomer(db, Number(c.req.param('id')), await c.req.json().catch(() => ({})), requireActor(c))))

  return app
}
