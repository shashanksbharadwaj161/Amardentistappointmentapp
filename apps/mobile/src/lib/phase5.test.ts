jest.mock('./supabase',()=>({supabase:null}))
import { getBusinessContext,getPatientPayments,startPaymentCheckout } from './phase5'
const user='00000000-0000-4000-8000-000000000001'
describe('phase 5 offline-safe operations',()=>{
  it('summarizes reconciled finance, inventory, and lab work',async()=>{const result=await getBusinessContext(user);expect(result.finance.grossPayments).toBeGreaterThan(result.finance.commissionTotal);expect(result.inventory[0]?.onHand).toBeLessThanOrEqual(result.inventory[0]?.reorderLevel??0);expect(result.labs).not.toHaveLength(0)})
  it('shows provider-confirmed payment history without secrets',async()=>{const result=await getPatientPayments(user);expect(result[0]).toMatchObject({provider:'bkash',status:'succeeded'})})
  it('keeps preview checkout outside real provider infrastructure',async()=>{const result=await startPaymentCheckout('70000000-0000-4000-8000-000000000001','nagad');expect(result.checkoutUrl).toContain('/nagad/checkout')})
})

