export type Actor = { id: number; role: 'admin' | 'cashier' }

export type SaleInput = {
  customerId?: number
  paymentMethod: 'cash' | 'transfer' | 'qris'
  items: Array<{ productId: number; quantity: number }>
  source: 'web' | 'telegram'
}

export type ExpenseInput = {
  expenseCategoryId: number
  amount: number
  transactionDate: string
  notes?: string
  source: 'web' | 'telegram'
}
