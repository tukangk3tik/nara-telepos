import { eq } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import type { DatabaseClient } from './db'
import { users } from './db/schema'
import { DomainError, ForbiddenError, UnauthenticatedError } from './domain/errors'
import type { Actor } from './domain/types'

export const SESSION_COOKIE = 'telepos_session'

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash)
  } catch {
    return false
  }
}

export function requireActor(c: Context): Actor {
  const actor = c.get('actor') as Actor | undefined
  if (!actor) throw new UnauthenticatedError()
  return actor
}

export function requireRole(...roles: Actor['role'][]): MiddlewareHandler {
  return async (c, next) => {
    try {
      if (!roles.includes(requireActor(c).role)) throw new ForbiddenError()
    } catch (error) {
      if (error instanceof DomainError) return c.json({ error: error.code }, error.code === 'UNAUTHENTICATED' ? 401 : 403)
      throw error
    }
    await next()
  }
}

export function requireSession(db: DatabaseClient, sessionSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const session = await getSignedCookie(c, sessionSecret, SESSION_COOKIE)
    const id = typeof session === 'string' && /^\d+$/.test(session) ? Number(session) : 0
    const user = id > 0
      ? db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).get()
      : undefined

    if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401)

    c.set('actor', { id: user.id, role: user.role })
    await next()
  }
}

export async function createBootstrapAdmin(
  db: DatabaseClient,
  input: { name: string; email: string; password: string },
): Promise<Actor & { name: string; email: string }> {
  const name = input.name.trim()
  const email = input.email.trim()
  if (!name || !email || !input.password) throw new DomainError('INVALID_BOOTSTRAP_ADMIN', 'Name, email, and password are required')
  if (db.select({ id: users.id }).from(users).limit(1).get()) {
    throw new DomainError('BOOTSTRAP_CLOSED', 'An administrator already exists')
  }

  const admin = db.insert(users).values({
    name,
    email,
    passwordHash: await hashPassword(input.password),
    role: 'admin',
  }).returning({ id: users.id, name: users.name, email: users.email, role: users.role }).get()

  if (!admin) throw new DomainError('BOOTSTRAP_FAILED', 'Could not create administrator')
  return admin
}
