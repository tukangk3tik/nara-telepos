export const cancellationReason = (value: string): string | null => value.trim() || null

export function stockAdjustment({ quantityDelta, reason }: { quantityDelta: string; reason: string }): { quantityDelta: number; reason: string } | null {
  const quantity = Number(quantityDelta)
  const trimmedReason = reason.trim()
  return Number.isInteger(quantity) && quantity !== 0 && trimmedReason
    ? { quantityDelta: quantity, reason: trimmedReason }
    : null
}
