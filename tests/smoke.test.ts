import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
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
  expect((await app.request('/sales/1')).headers.get('content-type')).toContain('text/html')
  expect((await app.request('/api/sales/1')).status).toBe(401)
  expect((await app.request('/api/missing', { headers: { cookie: login.headers.get('set-cookie')! } })).status).toBe(404)
})

test('prints the app and API URLs after the server starts', () => {
  const source = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8')
  expect(source).toContain('const server = Bun.serve')
  expect(source).toContain('App: http://localhost:${server.port}')
  expect(source).toContain('API: http://localhost:${server.port}/api')
})
