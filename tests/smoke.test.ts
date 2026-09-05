import { expect, test } from 'bun:test'
import { createApp } from '../src/server/app'
import { users } from '../src/server/db/schema'
import { createServerApp } from '../src/server/index'
import { createTestDatabase } from './helpers/database'

test('serves the SPA fallback and health endpoint without swallowing API 404s', async () => {
  const db = createTestDatabase()
  const password = 'secret123'
  db.insert(users).values({ name: 'Admin', email: 'admin@example.test', passwordHash: await Bun.password.hash(password), role: 'admin' }).run()
  const app = createServerApp(createApp({ db, sessionSecret: 'test-session-secret' }), '.')
  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password }),
  })

  expect((await app.request('/health')).status).toBe(200)
  expect((await app.request('/pos')).status).toBe(200)
  expect((await app.request('/pos')).headers.get('content-type')).toContain('text/html')
  expect((await app.request('/api/missing', { headers: { cookie: login.headers.get('set-cookie')! } })).status).toBe(404)
})
