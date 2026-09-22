import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createBootstrapAdmin, hashPassword, verifyPassword } from '../src/server/auth'
import { bootstrapCredentials } from '../src/server/bootstrap-admin'
import { createApp } from '../src/server/app'
import { users } from '../src/server/db/schema'
import { createTestDatabase } from './helpers/database'

const password = 'secret123'

async function appWithUser(role: 'admin' | 'cashier' = 'cashier', appBaseUrl = 'http://localhost:3000') {
  const db = createTestDatabase()
  await db.insert(users).values({
    name: 'Test User',
    email: 'cashier@example.test',
    passwordHash: await Bun.password.hash(password),
    role,
  })
  return createApp({ db, sessionSecret: 'test-session-secret', appBaseUrl })
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

test('bootstrap does not reopen on an existing database without an administrator', async () => {
  const db = createTestDatabase()
  db.insert(users).values({ name: 'Cashier', email: 'cashier@test', passwordHash: 'unused', role: 'cashier' }).run()
  await expect(createBootstrapAdmin(db, { name: 'Untrusted recovery', email: 'new@test', password })).rejects.toThrow('An administrator already exists')
  expect(db.select().from(users).all()).toHaveLength(1)
})

test('bootstrap prompts for credentials only when no arguments are supplied', async () => {
  const prompts: string[] = []
  const credentials = await bootstrapCredentials([], (label) => {
    prompts.push(label)
    return { 'Name: ': 'Initial Admin', 'Email: ': 'admin@example.test' }[label]!
  }, () => password)

  expect(prompts).toEqual(['Name: ', 'Email: '])
  expect(credentials).toEqual({ name: 'Initial Admin', email: 'admin@example.test', password })
  expect(await bootstrapCredentials(['Owner', 'owner@example.test', 'from-script'], () => { throw new Error('should not prompt') })).toEqual({ name: 'Owner', email: 'owner@example.test', password: 'from-script' })
})

test('bootstrap reads an interactive password without terminal echo', () => {
  const source = readFileSync(new URL('../src/server/bootstrap-admin.ts', import.meta.url), 'utf8')
  expect(source).toContain('stty -echo')
  expect(source).not.toContain("prompt('Password: ')")
})

test('logs in with a valid password and issues an HTTP-only localhost session cookie', async () => {
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
  expect(login.headers.get('set-cookie')).not.toContain('Secure')
})

test('HTTPS deployment config sets Secure on login and logout cookies behind an HTTP proxy', async () => {
  const app = await appWithUser('cashier', 'https://pos.example.test')
  const login = await app.request('http://internal:3000/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'http' },
    body: JSON.stringify({ email: 'cashier@example.test', password }),
  })
  expect(login.status).toBe(204)
  expect(login.headers.get('set-cookie')).toContain('Secure')
  const logout = await app.request('http://internal:3000/api/auth/logout', { method: 'POST' })
  expect(logout.headers.get('set-cookie')).toContain('Secure')
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
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
