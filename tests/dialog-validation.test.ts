import { expect, test } from 'bun:test'
import { cancellationReason, stockAdjustment } from '../src/client/lib/dialog-validation'

test('requires a nonblank cancellation reason', () => {
  expect(cancellationReason('  ')).toBeNull()
  expect(cancellationReason('Duplicate sale')).toBe('Duplicate sale')
})

test('requires a nonzero whole-number stock adjustment and a reason', () => {
  expect(stockAdjustment({ quantityDelta: '0', reason: 'count' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '2.5', reason: 'count' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '-2', reason: '  ' })).toBeNull()
  expect(stockAdjustment({ quantityDelta: '-2', reason: 'count correction' })).toEqual({ quantityDelta: -2, reason: 'count correction' })
})
