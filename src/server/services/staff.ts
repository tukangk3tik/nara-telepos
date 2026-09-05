import { and, eq, ne } from 'drizzle-orm'
import { hashPassword } from '../auth'
import type { DatabaseClient } from '../db'
import { telegramStaff, users } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { Actor } from '../domain/types'

const invalid = (message: string) => { throw new DomainError('INVALID_INPUT', message) }
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid('Invalid ID')
const active = (value: unknown): boolean => typeof value === 'boolean' ? value : invalid('Invalid staff state')
const role = (value: unknown): Actor['role'] => value === 'admin' || value === 'cashier' ? value : invalid('Invalid role')
const telegramId = (value: unknown) => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : invalid('Invalid Telegram user ID')
}

export function findActiveTelegramStaff(db: DatabaseClient, telegramUserId: string): Actor | null {
  const staff = db.select({ id: users.id, role: users.role })
    .from(telegramStaff).innerJoin(users, eq(telegramStaff.userId, users.id))
    .where(and(eq(telegramStaff.telegramUserId, telegramId(telegramUserId)), eq(telegramStaff.isActive, true))).get()
  return staff ?? null
}

export async function createUser(db: DatabaseClient, input: { name?: unknown; email?: unknown; password?: unknown; role?: unknown }) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!name || !email || !password) invalid('Invalid user')
  return db.insert(users).values({ name, email, passwordHash: await hashPassword(password), role: role(input.role) }).returning({ id: users.id, name: users.name, email: users.email, role: users.role }).get()
}

export function listUsers(db: DatabaseClient) {
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).all()
}

export function updateUserRole(db: DatabaseClient, userId: unknown, nextRole: unknown) {
  const targetId = id(userId)
  const targetRole = role(nextRole)
  return db.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, targetId)).get()
    if (!user) throw new DomainError('USER_NOT_FOUND', 'User not found')
    if (user.role === 'admin' && targetRole !== 'admin'
      && !tx.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), ne(users.id, targetId))).limit(1).get()) {
      throw new DomainError('LAST_ADMIN_CONFLICT', 'The final administrator cannot be demoted')
    }
    return tx.update(users).set({ role: targetRole }).where(eq(users.id, targetId))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role }).get()!
  }, { behavior: 'immediate' })
}

export function listTelegramStaff(db: DatabaseClient) {
  return db.select({ id: telegramStaff.id, userId: telegramStaff.userId, telegramUserId: telegramStaff.telegramUserId, isActive: telegramStaff.isActive, name: users.name, email: users.email, role: users.role })
    .from(telegramStaff).innerJoin(users, eq(telegramStaff.userId, users.id)).all()
}

export function linkTelegramStaff(db: DatabaseClient, userId: unknown, rawTelegramUserId: unknown) {
  const linkedUserId = id(userId)
  const linkedTelegramUserId = telegramId(rawTelegramUserId)
  return db.transaction((tx) => {
    if (!tx.select({ id: users.id }).from(users).where(eq(users.id, linkedUserId)).get()) throw new DomainError('USER_NOT_FOUND', 'User not found')
    if (tx.select({ id: telegramStaff.id }).from(telegramStaff).where(and(eq(telegramStaff.userId, linkedUserId))).get()
      || tx.select({ id: telegramStaff.id }).from(telegramStaff).where(eq(telegramStaff.telegramUserId, linkedTelegramUserId)).get()) {
      throw new DomainError('TELEGRAM_LINK_CONFLICT', 'Telegram staff link already exists')
    }
    return tx.insert(telegramStaff).values({ userId: linkedUserId, telegramUserId: linkedTelegramUserId }).returning().get()
  }, { behavior: 'immediate' })
}

export function setTelegramStaffActive(db: DatabaseClient, staffId: unknown, isActive: unknown) {
  const staff = db.update(telegramStaff).set({ isActive: active(isActive) }).where(eq(telegramStaff.id, id(staffId))).returning().get()
  if (!staff) throw new DomainError('TELEGRAM_STAFF_NOT_FOUND', 'Telegram staff not found')
  return staff
}

export function unlinkTelegramStaff(db: DatabaseClient, staffId: unknown) {
  const removed = db.delete(telegramStaff).where(eq(telegramStaff.id, id(staffId))).returning({ id: telegramStaff.id }).get()
  if (!removed) throw new DomainError('TELEGRAM_STAFF_NOT_FOUND', 'Telegram staff not found')
}
