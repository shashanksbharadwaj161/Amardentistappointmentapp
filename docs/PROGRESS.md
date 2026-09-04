# Build progress

Updated: 2026-09-04

Progress is gate-weighted rather than based on file count. A phase earns its full weight only after its required database, security, device, visual, and end-to-end gates pass.

| Phase | Product weight | Phase completion | Earned overall |
| --- | ---: | ---: | ---: |
| 1. Foundation, authentication, and UI | 15% | 99% | 14.85% |
| 2. Clinics, verification, and scheduling | 16% | 75% | 12.00% |
| 3. Marketplace, booking, and appointments | 20% | 80% | 16.00% |
| 4. Dental EHR and clinical records | 18% | 75% | 13.50% |
| 5. Payments, finance, inventory, labs, and subscriptions | 18% | 75% | 13.50% |
| 6. AI, administration, and production hardening | 13% | 0% | 0% |
| **Whole app** | **100%** |  | **69.85%** |

## Current gate

Phase 1 code, design, localization, tests, Edge Function fixtures, production exports, live schema deployment, live RLS enablement, live structural and behavioral pgTAP suites, migration-history registration, authentication URL configuration, hosted invitation-function deployment, and live unauthenticated rejection are green. Super Admin account activation is intentionally deferred to Phase 6 production hardening. A Maestro device flow is ready. Phase 1 still requires:

- Verify live password recovery and administrator invitation delivery.
- Complete the physical iOS and Android Maestro run.

Phase 2 has a complete local implementation for clinic/staff membership, clinic and dentist verification, private evidence, services, schedules, breaks, exceptions, day/week availability, and Admin review. The 2026-09-03 local gate passed lint, strict type checking, 17 application tests, 16 Edge Function tests, secret scanning, UI audit, all-platform Expo export, Admin production build, and five desktop/mobile Playwright flows. Phase 2 remains at 75% until:

- Apply `202609030002_phase2_clinics_scheduling.sql` to the linked Supabase project.
- Execute both Phase 2 pgTAP suites against live PostgreSQL and resolve any semantic or RLS failures.
- Deploy and verify the `clinic-invite` Edge Function.
- Complete physical iOS and Android Maestro verification, including English/Bangla, large text, and reduced motion.

Phase 3 is 80% complete. The local vertical slice now includes patient/family profiles, foreground location with a privacy-preserving fallback, dark map/list discovery, complete specialty/price/rating/gender/language controls, approved marketplace search, deterministic ranking, trusted availability, ten-minute holds, mock deposit confirmation, receipts, appointment history/cancellation/rescheduling, realtime chat plus ten-second schedule/waitlist/inbox refresh, atomic guest walk-ins, explicit clinic/dentist/service context, verified-dentist completion, single-use QR presentation and camera/manual redemption, exclusion-protected 15-minute waitlist join/offer/accept flows, committed expired-offer cleanup, cancellation/no-show rules, verified post-visit reviews, clinic schedule/waitlist/inbox operations, a notification outbox, and PostgreSQL overlap constraints. English and Bangla patient/professional flows passed live browser interaction at phone and tablet widths with no horizontal overflow or runtime errors, including the repaired 730px clinic-schedule layout and expanded split workspace. Five Phase 3 migrations, 64 structural pgTAP assertions, and 61 booking-behavior assertions parse as PostgreSQL; 6 shared Phase 3 unit tests pass. It remains incomplete until migrations/tests run semantically, an actual map provider is connected, notification delivery/retry is deployed, and physical-device QR/Maestro/accessibility flows are verified.

Phase 4 is 75% complete as a tested local vertical slice. The clinical migration adds medical histories, allergies, versioned bilingual consent, encounters/progress notes, diagnoses, adult/primary FDI odontograms, treatment plans/items, private clinical media, structured prescriptions/items, immutable lifecycle states, and before/after versions with author/reason/time. RLS excludes front desk, managers, owners, and ordinary Admins from clinical details; verified treating dentists receive only authorized access; patients see only finalized records; cross-clinic reads require active clinic-specific consent; and exceptional Super Admin reads use an audited RPC. The Expo app connects checked-in appointments to clinician documentation and atomically completes the visit on encounter finalization. Patients can maintain history/allergies, see finalized records, revoke consent, open short-lived private media URLs, and request a server-generated prescription PDF through a tested Edge Function. Browser QA passed at 320px and the reported 730px width with no horizontal overflow; the consent surface exposes explicit radio/checkbox semantics. The migration and 94 pgTAP assertions parse as PostgreSQL, 5 shared clinical-rule tests and 3 mobile clinical tests pass, and 6 prescription-function tests pass. It remains gated on live migration/semantic RLS execution, physical iOS/Android Maestro, large-text/reduced-motion/device file handling, and practicing-dentist validation.

Phase 5 is 75% complete as a tested local vertical slice. The migration adds server-derived bKash/Nagad payment preparation, signed idempotent payment processing, bounded idempotent refunds, invoices/discounts/balances, commission and clinic payable ledgers, expenses/payouts/reconciliation reports, lots/expiry/atomic stock movements, suppliers/purchase orders/receipts, lab vendors/cases/attachments/workflow, and RevenueCat plan/subscription synchronization. Direct client writes cannot forge payments, ledger entries, stock, or subscriptions. Mobile patients receive provider checkout, payment history, and purchase/restore subscription flows; clinic owners/managers receive finance, stock/reorder/expiry, lab, expense, and plan status surfaces; Super Admin receives audited commission and plan controls. The local gate passes 26 shared tests, 12 mobile tests, 3 Admin tests, 40 Edge Function tests, secret/UI audits, Admin build, Expo web/iOS/Android exports, PostgreSQL parsing, and 87 Phase 5 pgTAP assertions. Responsive English/Bangla browser QA passed at 320px and 730px without horizontal overflow. It remains gated on live migration/semantic pgTAP, real bKash/Nagad merchant credentials and provider certification, signed live webhook/reconciliation/refund testing, RevenueCat project/store products and sandbox purchase/restore on physical iOS/Android devices, and real payout operations.
