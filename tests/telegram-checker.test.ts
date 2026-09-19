import { expect, test } from 'bun:test'
import { createApp } from '../src/server/app'
import { users } from '../src/server/db/schema'
import { checkTelegramBot } from '../src/server/telegram/client'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function setup(options: { telegramBotToken?: string; telegramChecker?: () => Promise<void> } = {}) {
  const db = createTestDatabase()
  const passwordHash = await Bun.password.hash(password)
  db.insert(users).values([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'Cashier', email: 'cashier@example.test', passwordHash, role: 'cashier' },
  ]).run()
  const app = createApp({ db, sessionSecret: 'test-session-secret', ...options })

  async function requestAs(email: string, path: string, init?: RequestInit) {
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return app.request(path, {
      ...init,
      headers: { cookie: login.headers.get('set-cookie')!, ...init?.headers },
    })
  }

  return {
    app,
    adminRequest: (path: string, init?: RequestInit) => requestAs('admin@example.test', path, init),
    cashierRequest: (path: string, init?: RequestInit) => requestAs('cashier@example.test', path, init),
  }
}

test('admin can verify a configured Telegram bot', async () => {
  const { adminRequest } = await setup({ telegramChecker: async () => {} })

  const response = await adminRequest('/api/settings/telegram/check', { method: 'POST' })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test('checker is restricted and maps missing or failed configuration', async () => {
  const configured = await setup({ telegramChecker: async () => { throw new Error('Telegram check failed') } })
  const failed = await configured.adminRequest('/api/settings/telegram/check', { method: 'POST' })

  expect((await configured.cashierRequest('/api/settings/telegram/check', { method: 'POST' })).status).toBe(403)
  expect((await configured.app.request('/api/settings/telegram/check', { method: 'POST' })).status).toBe(401)
  expect(failed.status).toBe(502)
  expect(await failed.json()).toEqual({ error: 'TELEGRAM_UNAVAILABLE' })

  const missing = await setup()
  const unavailable = await missing.adminRequest('/api/settings/telegram/check', { method: 'POST' })
  expect(unavailable.status).toBe(503)
  expect(await unavailable.json()).toEqual({ error: 'TELEGRAM_NOT_CONFIGURED' })
})

test('Telegram checker resolves only for a successful Bot API response', async () => {
  let requestedUrl = ''
  await expect(checkTelegramBot('valid-token', async (url) => {
    requestedUrl = url.toString()
    return Response.json({ ok: true })
  })).resolves.toBeUndefined()
  expect(requestedUrl).toBe('https://api.telegram.org/botvalid-token/getMe')

  await expect(checkTelegramBot('invalid-token', async () => Response.json({ ok: false })))
    .rejects.toThrow('Telegram check failed')
})

test('Telegram checker hides tokens in HTTP, JSON, and network errors', async () => {
  const token = 'secret-token'
  const fetchers = [
    async () => Response.json({ ok: true }, { status: 401 }),
    async () => new Response('not-json'),
    async () => { throw new Error(`request failed for ${token}`) },
  ]

  for (const fetcher of fetchers) {
    let error: unknown
    try {
      await checkTelegramBot(token, fetcher)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Telegram check failed')
    expect((error as Error).message).not.toContain(token)
  }
})
