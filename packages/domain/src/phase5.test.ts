import { describe, expect, it } from 'vitest'
import { checkoutRequestSchema, commissionAmount, invoiceTotals, projectedStock, stockMovementSchema } from './phase5'

describe('phase 5 financial and operational rules', () => {
  it('derives invoice subtotal, total, and remaining balance', () => expect(invoiceTotals([{ quantity: 2, unitPriceBdt: 500 }, { quantity: 1, unitPriceBdt: 300 }], 100, 400)).toEqual({ subtotalBdt: 1300, totalBdt: 1200, balanceBdt: 800 }))
  it('never returns a negative invoice balance', () => expect(invoiceTotals([{ quantity: 1, unitPriceBdt: 500 }], 0, 700).balanceBdt).toBe(0))
  it('calculates commission using percentage basis points safely', () => expect(commissionAmount(1250, 7.5)).toBe(93.75))
  it('projects receipts and consumption in opposite directions', () => { expect(projectedStock(10, 'receipt', 3)).toBe(13); expect(projectedStock(10, 'consumption', 3)).toBe(7) })
  it('rejects malformed provider checkout requests', () => expect(checkoutRequestSchema.safeParse({ appointmentId: 'bad', provider: 'cash', idempotencyKey: 'short' }).success).toBe(false))
  it('requires positive stock movements and a reason', () => expect(stockMovementSchema.safeParse({ clinicId: crypto.randomUUID(), itemId: crypto.randomUUID(), lotId: null, movementType: 'consumption', quantity: 0, reason: '', referenceType: '', referenceId: null }).success).toBe(false))
})
