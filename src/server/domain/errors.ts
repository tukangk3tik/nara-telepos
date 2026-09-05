export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class UnauthenticatedError extends DomainError {
  constructor() {
    super('UNAUTHENTICATED', 'Authentication required')
  }
}

export class ForbiddenError extends DomainError {
  constructor() {
    super('FORBIDDEN', 'Insufficient permissions')
  }
}

export class InsufficientStockError extends DomainError {
  constructor() {
    super('INSUFFICIENT_STOCK', 'Insufficient stock')
  }
}

export class SaleAlreadyCancelledError extends DomainError {
  constructor() {
    super('SALE_ALREADY_CANCELLED', 'Sale has already been cancelled')
  }
}
