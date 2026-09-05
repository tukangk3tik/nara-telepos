import { Hono } from 'hono'
import { requireActor, requireRole, requireSession } from './auth'
import type { DatabaseClient } from './db'
import { DomainError } from './domain/errors'
import { createAuthRoutes } from './routes/auth'
import { createCustomerRoutes } from './routes/customers'
import { createExpenseRoutes } from './routes/expenses'
import { createProductRoutes } from './routes/products'
import { createSalesRoutes } from './routes/sales'
import { createSettingsRoutes } from './routes/settings'

export type AppOptions = { db: DatabaseClient; sessionSecret: string }

export function createApp({ db, sessionSecret }: AppOptions) {
  const app = new Hono()

  app.route('/api/auth', createAuthRoutes({ db, sessionSecret }))
  app.use('/api/*', requireSession(db, sessionSecret))
  app.onError((error, c) => {
    if (error instanceof DomainError) {
      const status = error.code === 'UNAUTHENTICATED' ? 401
        : error.code === 'FORBIDDEN' ? 403
          : error.code.endsWith('_NOT_FOUND') ? 404
            : error.code.endsWith('_CONFLICT') || error.code === 'SALE_ALREADY_CANCELLED' ? 409
              : error.code === 'INSUFFICIENT_STOCK' || error.code.endsWith('_INACTIVE') ? 422
                : 400
      return c.json({ error: error.code }, status)
    }
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return c.json({ error: 'CONFLICT' }, 409)
    return c.json({ error: 'INTERNAL_ERROR' }, 500)
  })
  app.get('/api/auth/me', (c) => c.json(requireActor(c)))
  app.use('/api/settings/*', requireRole('admin'))
  app.route('/api/products', createProductRoutes({ db }))
  app.route('/api/customers', createCustomerRoutes({ db }))
  app.route('/api/sales', createSalesRoutes({ db }))
  app.route('/api/expenses', createExpenseRoutes({ db }))
  app.route('/api/settings', createSettingsRoutes({ db }))

  return app
}
