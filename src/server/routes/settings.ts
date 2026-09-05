import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireRole } from '../auth'
import type { DatabaseClient } from '../db'
import { appSettings } from '../db/schema'
import { createExpenseCategory, listExpenseCategories, updateExpenseCategory } from '../services/catalog'
import { createUser, linkTelegramStaff, listTelegramStaff, listUsers, setTelegramStaffActive, unlinkTelegramStaff, updateUserRole } from '../services/staff'
import { DomainError } from '../domain/errors'

export function createSettingsRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.use('*', requireRole('admin'))
  app.get('/profile', () => Response.json(db.select().from(appSettings).where(eq(appSettings.id, 1)).get() ?? { id: 1, storeName: '', receiptFooter: '' }))
  app.put('/profile', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : ''
    const receiptFooter = typeof body.receiptFooter === 'string' ? body.receiptFooter.trim() : ''
    if (!storeName) throw new DomainError('INVALID_INPUT', 'Store name is required')
    const profile = db.insert(appSettings).values({ id: 1, storeName, receiptFooter }).onConflictDoUpdate({ target: appSettings.id, set: { storeName, receiptFooter } }).returning().get()
    return c.json(profile)
  })

  app.get('/expense-categories', (c) => c.json(listExpenseCategories(db, c.req.query('active') === 'true')))
  app.get('/expense-categories/active', (c) => c.json(listExpenseCategories(db, true)))
  app.post('/expense-categories', async (c) => c.json(createExpenseCategory(db, (await c.req.json().catch(() => ({}))).name), 201))
  app.put('/expense-categories/:id', async (c) => c.json(updateExpenseCategory(db, Number(c.req.param('id')), await c.req.json().catch(() => ({})))))

  app.get('/users', (c) => c.json(listUsers(db)))
  app.post('/users', async (c) => c.json(await createUser(db, await c.req.json().catch(() => ({}))), 201))
  app.put('/users/:id', async (c) => c.json(updateUserRole(db, Number(c.req.param('id')), (await c.req.json().catch(() => ({}))).role)))

  app.get('/telegram-staff', (c) => c.json(listTelegramStaff(db)))
  app.post('/telegram-staff', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return c.json(linkTelegramStaff(db, body.userId, body.telegramUserId), 201)
  })
  app.put('/telegram-staff/:id', async (c) => c.json(setTelegramStaffActive(db, Number(c.req.param('id')), (await c.req.json().catch(() => ({}))).isActive)))
  app.delete('/telegram-staff/:id', (c) => {
    unlinkTelegramStaff(db, Number(c.req.param('id')))
    return c.body(null, 204)
  })

  return app
}
