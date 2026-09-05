import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../db'
import { expenseCategories, expenses, users } from '../db/schema'
import { DomainError } from '../domain/errors'
import type { Actor, ExpenseInput, ExpenseReceipt } from '../domain/types'

const invalid = (message: string): never => { throw new DomainError('INVALID_INPUT', message) }
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function validateActor(actor: Actor) {
  if (!actor || !isPositiveInteger(actor.id) || (actor.role !== 'admin' && actor.role !== 'cashier')) {
    throw new DomainError('INVALID_ACTOR', 'Invalid actor')
  }
  return actor
}

function validateExpenseInput(input: ExpenseInput) {
  if (!input || typeof input !== 'object' || !isPositiveInteger(input.expenseCategoryId) || !isPositiveInteger(input.amount)
    || (input.source !== 'web' && input.source !== 'telegram')) invalid('Invalid expense')

  const transactionDate = typeof input.transactionDate === 'string' ? input.transactionDate : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || new Date(`${transactionDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== transactionDate) {
    invalid('Invalid transaction date')
  }
  const notes = input.notes === undefined ? null : typeof input.notes === 'string' ? input.notes.trim() : invalid('Invalid notes')
  if (notes !== null && notes.length > 1000) invalid('Notes are too long')
  return { expenseCategoryId: input.expenseCategoryId, amount: input.amount, transactionDate, notes: notes || null, source: input.source }
}

export async function createExpense(db: DatabaseClient, input: ExpenseInput, actor: Actor): Promise<ExpenseReceipt> {
  return db.transaction((tx) => {
    const expenseInput = validateExpenseInput(input)
    const expenseActor = validateActor(actor)
    const storedActor = tx.select({ role: users.role }).from(users).where(eq(users.id, expenseActor.id)).get()
    if (!storedActor) throw new DomainError('ACTOR_NOT_FOUND', 'Actor not found')
    if (storedActor.role !== expenseActor.role) throw new DomainError('FORBIDDEN', 'Actor role no longer applies')

    const category = tx.select({ id: expenseCategories.id, name: expenseCategories.name, isActive: expenseCategories.isActive })
      .from(expenseCategories).where(eq(expenseCategories.id, expenseInput.expenseCategoryId)).get()
    if (!category) throw new DomainError('EXPENSE_CATEGORY_NOT_FOUND', 'Expense category not found')
    if (!category.isActive) throw new DomainError('EXPENSE_CATEGORY_INACTIVE', 'Expense category is inactive')

    const expenseNumber = `EXP-${crypto.randomUUID()}`
    const expense = tx.insert(expenses).values({ ...expenseInput, expenseNumber, createdByUserId: expenseActor.id })
      .returning({ id: expenses.id, expenseNumber: expenses.expenseNumber }).get()
    if (!expense) throw new DomainError('EXPENSE_CREATE_FAILED', 'Could not create expense')

    return { ...expense, amount: expenseInput.amount, categoryName: category.name, transactionDate: expenseInput.transactionDate }
  }, { behavior: 'immediate' })
}
