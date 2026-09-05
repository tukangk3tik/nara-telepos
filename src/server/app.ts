import { Hono } from 'hono'
import { requireActor, requireRole, requireSession } from './auth'
import type { DatabaseClient } from './db'
import { createAuthRoutes } from './routes/auth'

export type AppOptions = { db: DatabaseClient; sessionSecret: string }

export function createApp({ db, sessionSecret }: AppOptions) {
  const app = new Hono()

  app.route('/api/auth', createAuthRoutes({ db, sessionSecret }))
  app.use('/api/*', requireSession(db, sessionSecret))
  app.get('/api/auth/me', (c) => c.json(requireActor(c)))
  app.use('/api/settings/*', requireRole('admin'))

  return app
}
