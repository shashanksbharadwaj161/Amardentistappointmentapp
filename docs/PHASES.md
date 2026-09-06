# Six-phase delivery ledger

Updated: 2026-09-05. Exact gate weighting is in `docs/PROGRESS.md`.

## Phase 1 — Foundation, authentication, and UI system

Implemented: Expo mobile app, separate React Admin console, shared domain/localization/permissions package, Supabase migrations/functions, verified email/password flows, recovery, secure session persistence, patient/professional switching, English/Bangla UI, roles/invitations/audit/configuration, reusable responsive components, refined mascot assets, and production exports.

Open gate: activate the real Super Admin accounts only at the final access ceremony and verify delivery/device flows on physical iOS and Android.

## Phase 2 — Clinics, verification, and scheduling

Implemented: owners/managers/dentists/front desk, one-person and multi-clinic dentists, private BMDC/clinic evidence, approval history, services/prices/deposits, weekly schedules, breaks/holidays/exceptions, shared availability, professional calendars, and responsive Admin review.

Hosted proof: 36 structural and 35 behavior pgTAP assertions pass.

`clinic-invite` is deployed. Open gate: authenticated delivery/failure testing and physical-device/accessibility checks.

## Phase 3 — Marketplace, booking, and appointments

Implemented: family profiles, location fallback, dark map/list discovery, filters/ranking, provider profiles, services/slots, ten-minute server holds, trusted duration/deposit, advisory locking and GiST exclusion, mock payment, receipts, single-use QR, realtime-aware schedule/chat, walk-ins, cancellation/rescheduling, waitlist offers, no-shows, reviews, and notification outbox.

Hosted proof: 64 structural and 61 behavior pgTAP assertions pass, including concurrency boundaries, expired holds, QR replay denial, and waitlist rules.

Open gate: production map provider, deployed notification worker, physical QR/realtime/Maestro checks, and payment-provider transition.

## Phase 4 — Dental EHR and clinical records

Implemented: medical history/allergies, encounters/progress notes, diagnoses, adult and primary FDI odontograms, treatment plans/progress, private photos/X-rays, structured prescriptions and private PDFs, versioned bilingual consent, strict treating-dentist RLS, consent-gated cross-clinic access, before/after versions, finalized-only patient access, and reason-required audited Super Admin snapshots.

Hosted proof: 51 structural and 43 behavior pgTAP assertions pass.

Prescription generation is deployed. Open gate: authenticated private Storage delivery, physical file/device checks, and practicing-dentist validation.

## Phase 5 — Payments, finance, inventory, labs, and subscriptions

Implemented: server-derived bKash/Nagad checkout adapters, signed idempotent callbacks/refunds, invoices/balances/discounts/expenses/receipts, commission and clinic payable ledgers, reports, stock items/lots/expiry/movements, suppliers/purchasing, treatment consumption, negative-stock prevention, lab vendors/cases/workflow/private attachments, and RevenueCat synchronization plus configurable plans/entitlements.

Hosted proof: 61 structural and 26 behavior pgTAP assertions pass.

Open gate: merchant approval/credentials and real reconciliation, RevenueCat/store setup and physical purchase/restore, and pilot payout acceptance.

## Phase 6 — AI, administration, and production hardening

Implemented:

- Dentist AI drafts for clinical notes and prescriptions, photo-quality checks, non-diagnostic oral-photo descriptions, and separately labelled experimental X-ray observations.
- Mandatory per-field dentist review before a draft can be accepted; raw output is never patient-visible.
- Patient AI symptom intake, finalized-record explanation, general guidance, urgency suggestions, and booking routing with diagnosis/prescription blocking.
- Versioned prompts and complete task/provider/model/input/raw/safe/final/reviewer/usage/cost audit records.
- Write-only AI key rotation through a server-only function and Supabase Vault; clients receive only masked status.
- Rate limits, feature flags, usage limits, notification devices/deliveries/worker, support cases, moderation actions, and privacy-safe aggregate usage.
- Super Admin read-only users, cases, and audit investigation surfaces, plus working AI/provider, flags, limits, commission, plans, and verification configuration surfaces.
- Database-enforced AI release flags and subscription-aware quotas, atomic dentist review/application, and notification processing-lease recovery.
- Legal drafts, production/pilot checklist, restore-drill procedure, safety fixtures, and 24-screen visual evidence pack.

Hosted proof: 47 structural and 28 behavior pgTAP assertions pass.

All Phase 6 functions are deployed. Open gate: add operational case assignment/resolution, moderation, and refund actions; review the custom-auth gateway setting; live-test authenticated/provider success paths; add the real AI key; configure delivery providers; and complete restore drill, physical-device suite, legal/clinical review, signed store builds, real Super Admin activation, and closed-clinic pilot.

## Rule for declaring completion

No adapter, mock, browser preview, or syntax check can substitute for the real provider, database, physical-device, legal, clinical, or pilot gate named above. No phase closes with a known critical or high-severity defect.
