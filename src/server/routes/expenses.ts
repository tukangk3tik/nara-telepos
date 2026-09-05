import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireActor } from '../auth'
import type { DatabaseClient } from '../db'
import { expenseCategories, expenses } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { ExpenseInput } from '../domain/types'
import { createExpense } from '../services/expenses'

const expenseId = (value: string) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new DomainError('INVALID_INPUT', 'Invalid expense')
  return id
}

const expenseFields = {
  id: expenses.id,
  expenseNumber: expenses.expenseNumber,
  expenseCategoryId: expenses.expenseCategoryId,
  amount: expenses.amount,
  transactionDate: expenses.transactionDate,
  notes: expenses.notes,
  source: expenses.source,
  createdByUserId: expenses.createdByUserId,
  createdAt: expenses.createdAt,
  categoryName: expenseCategories.name,
}

export function createExpenseRoutes({ db }: { db: DatabaseClient }) {
  const app = new Hono()

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    return c.json(await createExpense(db, {
      source: 'web',
      expenseCategoryId: input.expenseCategoryId as number,
      amount: input.amount as number,
      transactionDate: input.transactionDate as string,
      notes: input.notes as string | undefined,
    } as ExpenseInput, requireActor(c)), 201)
  })

  app.get('/', (c) => {
    const actor = requireActor(c)
    return c.json(db.select(expenseFields).from(expenses).innerJoin(expenseCategories, eq(expenses.expenseCategoryId, expenseCategories.id))
      .where(actor.role === 'admin' ? undefined : eq(expenses.createdByUserId, actor.id))
      .orderBy(desc(expenses.createdAt)).all())
  })

  app.get('/:id', (c) => {
    const actor = requireActor(c)
    const id = expenseId(c.req.param('id'))
    const expense = db.select(expenseFields).from(expenses).innerJoin(expenseCategories, eq(expenses.expenseCategoryId, expenseCategories.id))
      .where(actor.role === 'admin'
        ? eq(expenses.id, id)
        : and(eq(expenses.id, id), eq(expenses.createdByUserId, actor.id))).get()
    if (!expense) throw new DomainError('EXPENSE_NOT_FOUND', 'Expense not found')
    return c.json(expense)
  })

  return app
}
