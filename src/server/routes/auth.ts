import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, setSignedCookie } from 'hono/cookie'
import { SESSION_COOKIE, verifyPassword } from '../auth'
import type { DatabaseClient } from '../db'
import { users } from '../db/schema'

type AuthRouteOptions = { db: DatabaseClient; sessionSecret: string }

const cookieOptions = { httpOnly: true, path: '/', sameSite: 'Lax' as const }

export function createAuthRoutes({ db, sessionSecret }: AuthRouteOptions) {
  const app = new Hono()

  app.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const user = email
      ? db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email)).get()
      : undefined

    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: 'INVALID_CREDENTIALS' }, 401)
    }

    await setSignedCookie(c, SESSION_COOKIE, String(user.id), sessionSecret, cookieOptions)
    return c.body(null, 204)
  })

  app.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, cookieOptions)
    return c.body(null, 204)
  })

  return app
}
