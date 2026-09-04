import { z } from 'zod'

const money = z.number().finite().min(0).max(100_000_000)
const positiveMoney = z.number().finite().positive().max(100_000_000)
const trimmed = (max: number) => z.string().trim().max(max)

export const paymentProviderSchema = z.enum(['bkash', 'nagad'])
export const checkoutRequestSchema = z.object({ appointmentId: z.uuid(), provider: paymentProviderSchema, idempotencyKey: z.string().trim().min(12).max(120) })
export const refundRequestSchema = z.object({ paymentId: z.uuid(), amountBdt: positiveMoney, reason: z.string().trim().min(3).max(500), idempotencyKey: z.string().trim().min(12).max(120) })

export const invoiceDraftSchema = z.object({
  clinicId: z.uuid(), patientProfileId: z.uuid().nullable(), appointmentId: z.uuid().nullable(), discountBdt: money.default(0),
  items: z.array(z.object({ description: z.string().trim().min(1).max(500), quantity: z.number().positive().max(10_000), unitPriceBdt: money })).min(1).max(100),
})

export const expenseSchema = z.object({ clinicId: z.uuid(), category: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(500), amountBdt: money, incurredOn: z.iso.date() })
export const stockMovementSchema = z.object({ clinicId: z.uuid(), itemId: z.uuid(), lotId: z.uuid(), movementType: z.enum(['receipt', 'consumption', 'adjustment_in', 'adjustment_out', 'expiry', 'return']), quantity: z.number().positive().max(1_000_000), reason: z.string().trim().min(3).max(500), referenceType: trimmed(80), referenceId: z.uuid().nullable() })
export const inventoryItemSchema = z.object({ clinicId: z.uuid(), sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(300), unit: z.string().trim().min(1).max(40), reorderLevel: z.number().min(0).max(1_000_000) })

export const labCaseSchema = z.object({ clinicId: z.uuid(), patientProfileId: z.uuid(), encounterId: z.uuid().nullable(), vendorId: z.uuid(), caseType: z.string().trim().min(1).max(200), dueDate: z.iso.date(), costBdt: money, notes: trimmed(2000) })
export const subscriptionTierSchema = z.enum(['patient_plus', 'clinic_pro'])

export function invoiceTotals(items: Array<{ quantity: number; unitPriceBdt: number }>, discountBdt: number, paidBdt = 0) {
  const subtotalBdt = items.reduce((sum, item) => sum + item.quantity * item.unitPriceBdt, 0)
  const totalBdt = Math.max(0, subtotalBdt - discountBdt)
  return { subtotalBdt, totalBdt, balanceBdt: Math.max(0, totalBdt - paidBdt) }
}

export function commissionAmount(grossBdt: number, ratePercent: number) {
  return Math.round(grossBdt * ratePercent) / 100
}

export function projectedStock(currentQuantity: number, movementType: z.infer<typeof stockMovementSchema>['movementType'], quantity: number) {
  return currentQuantity + (movementType === 'receipt' || movementType === 'adjustment_in' || movementType === 'return' ? quantity : -quantity)
}

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
export type RefundRequest = z.infer<typeof refundRequestSchema>
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type StockMovementInput = z.infer<typeof stockMovementSchema>
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>
export type LabCaseInput = z.infer<typeof labCaseSchema>
