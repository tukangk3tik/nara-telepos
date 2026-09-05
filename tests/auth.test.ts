import { expect, test } from 'bun:test'
import { createBootstrapAdmin, hashPassword, verifyPassword } from '../src/server/auth'
import { createApp } from '../src/server/app'
import { users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function appWithUser(role: 'admin' | 'cashier' = 'cashier') {
  const db = createTestDatabase()
  await db.insert(users).values({
    name: 'Test User',
    email: 'cashier@example.test',
    passwordHash: await Bun.password.hash(password),
    role,
  })
  return createApp({ db, sessionSecret: 'test-session-secret' })
}

test('hashes passwords without retaining the plaintext', async () => {
  const hash = await hashPassword(password)

  expect(hash).not.toBe(password)
  expect(await verifyPassword(password, hash)).toBe(true)
  expect(await verifyPassword('wrong-password', hash)).toBe(false)
})

test('bootstraps exactly one initial administrator', async () => {
  const db = createTestDatabase()

  const admin = await createBootstrapAdmin(db, {
    name: 'Initial Admin',
    email: 'admin@example.test',
    password,
  })

  expect(admin).toMatchObject({ email: 'admin@example.test', role: 'admin' })
  await expect(createBootstrapAdmin(db, {
    name: 'Second Admin',
    email: 'second@example.test',
    password,
  })).rejects.toThrow('An administrator already exists')
})

test('logs in with a valid password and issues a secure session cookie', async () => {
  const app = await appWithUser()

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cashier@example.test', password }),
  })

  expect(login.status).toBe(204)
  expect(login.headers.get('set-cookie')).toMatch(/telepos_session=\d+\.[^;]+/)
  expect(login.headers.get('set-cookie')).toContain('HttpOnly')
  expect(login.headers.get('set-cookie')).toContain('SameSite=Lax')
})

test('rejects invalid credentials', async () => {
  const app = await appWithUser()

  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cashier@example.test', password: 'wrong-password' }),
  })

  expect(login.status).toBe(401)
})

test('rejects an unauthenticated settings request', async () => {
  const app = await appWithUser()

  expect((await app.request('/api/settings/users')).status).toBe(401)
})

test('rejects a cashier settings request', async () => {
  const app = await appWithUser()
  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cashier@example.test', password }),
  })

  expect((await app.request('/api/settings/users', {
    headers: { cookie: login.headers.get('set-cookie')! },
  })).status).toBe(403)
})

test('logs out by clearing the session cookie', async () => {
  const app = await appWithUser()

  const logout = await app.request('/api/auth/logout', { method: 'POST' })

  expect(logout.status).toBe(204)
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
})
