# Build progress

Updated: 2026-09-06

Progress is gate-weighted, not based on screens or file count. A phase earns full credit only after its database, security, provider, physical-device, visual, and pilot gates pass.

| Phase | Product weight | Phase completion | Earned overall |
| --- | ---: | ---: | ---: |
| 1. Foundation, authentication, and UI | 15% | 99% | 14.85% |
| 2. Clinics, verification, and scheduling | 16% | 90% | 14.40% |
| 3. Marketplace, booking, and appointments | 20% | 89% | 17.80% |
| 4. Dental EHR and clinical records | 18% | 90% | 16.20% |
| 5. Payments, finance, inventory, labs, and subscriptions | 18% | 81% | 14.58% |
| 6. AI, administration, and production hardening | 13% | 77% | 10.01% |
| **Whole app** | **100%** |  | **87.84%** |

## Verified checkpoint

All versioned migrations through `202609050014_phase6_finish_review_repairs.sql` are applied to hosted Supabase project `cfjoxuucukktegznbkoc` and registered in migration history. Hosted pgTAP completed with **452 passing assertions**:

- Phase 2: 36 structure + 35 behavior.
- Phase 3: 64 structure + 61 behavior.
- Phase 4: 51 structure + 43 behavior.
- Phase 5: 61 structure + 26 behavior.
- Phase 6: 47 structure + 28 behavior.

Live execution found and repaired issues that syntax-only checks could not detect: UUID GiST support, payment-table evolution across phases, ambiguous hold/cancellation identifiers, stable invalid-FDI errors, and private prescription file-path validation. Corrective migrations preserve the hosted history.

The 2026-09-06 local regression gate is green:

- Lint and strict TypeScript passed across shared, mobile, and Admin packages.
- 31 shared domain tests, 12 mobile tests, and 3 Admin tests passed.
- 54 Edge Function tests passed across invitations, prescriptions, payments, subscriptions, AI, key rotation, and notification delivery.
- Secret scan passed across 258 files.
- Impeccable UI audit returned zero repository findings.
- Admin production build and Expo web, iOS, and Android exports passed.
- 7 Admin Playwright journeys passed across desktop/mobile Chromium; 1 desktop-only mobile-navigation case was intentionally skipped.
- A 24-screen UI pack documents patient, professional, Bangla, and Super Admin surfaces in `docs/screenshots/ui-pack`.
- All 10 repository Edge Functions are deployed to the hosted project. Anonymous smoke requests are rejected with HTTP 401, proving the default boundary remains closed.
- The independent finish review passed with no remaining critical or high-severity source issue.

## Phase status

### Phase 1 — 99%

Authentication, verified email flow, password recovery, patient/professional modes, English/Bangla localization, roles, invitations, audit/configuration foundations, responsive components, and live Phase 1 schema are implemented. Real Super Admin activation remains intentionally deferred to the final access ceremony. Physical-device authentication delivery checks remain.

### Phase 2 — 90%

Clinic ownership/memberships, one-person and multi-clinic dentists, private credential evidence, approval history, services, prices/deposits, schedules, breaks/exceptions, availability, Admin review, and clinic invitations are implemented. Hosted migration and all 71 pgTAP assertions pass; `clinic-invite` is deployed. Remaining: authenticated invitation delivery/failure testing and physical iOS/Android accessibility/device runs.

### Phase 3 — 89%

Family profiles, location fallback, dark map/list discovery, filters/ranking, trusted availability, ten-minute holds, exclusion-protected booking, mock confirmation, receipts, QR check-in, realtime-aware operations, walk-ins, cancellations/rescheduling, waitlist offers, no-shows, reviews, chat, and notification outbox are implemented. Hosted migration and all 125 pgTAP assertions pass. Remaining: production map provider, deployed notification processing, physical QR/realtime/Maestro checks, and real payment transition.

### Phase 4 — 90%

Medical history, allergies, encounters, diagnoses, adult/primary FDI odontograms, treatment plans, private media, prescriptions/PDFs, versioned bilingual consent, strict clinical RLS, consent revocation, finalized-only patient access, and audited Super Admin clinical snapshots are implemented. Hosted migration and all 94 pgTAP assertions pass; private prescription generation is deployed. Remaining: authenticated Storage delivery testing, physical file/device checks, and practicing-dentist validation.

### Phase 5 — 81%

bKash/Nagad server adapters, signed idempotent callbacks/refunds, invoices, commission/payables, expenses/payouts, reconciliation, stock/lots/expiry, suppliers/purchasing, labs, and RevenueCat synchronization are implemented with client and Admin surfaces. Hosted migration and all 87 pgTAP assertions pass. Remaining external gates are merchant certification/credentials, live payment and refund reconciliation, RevenueCat store products and device purchases/restores, and pilot payout acceptance.

### Phase 6 — 77%

Dentist AI drafting, photo-quality/oral-photo tasks, separately gated experimental X-ray observations, patient symptom/general guidance and record explanation, prompt versions, raw/safe/final output separation, mandatory field-by-field dentist review, usage/cost audit, rate limiting, write-only Vault key rotation, notification worker, feature flags/limits, and Super Admin oversight/configuration workspaces are implemented. AI feature flags and subscription-aware quotas are database-enforced; dentist review and clinical application are atomic; failed notification workers recover through a processing lease. Hosted migration and all 75 Phase 6 pgTAP assertions pass. Legal drafts, production runbook, backup/restore procedure, and AI safety fixtures exist.

All AI/key-rotation/notification functions are deployed, but their provider-dependent success paths remain intentionally unconfigured. User, support-case, audit, and AI oversight are currently read-only investigation surfaces; operational assignment/resolution, moderation, and refund actions remain a production gate. Remaining: review the custom-auth gateway setting before provider webhooks/workers go live, enter a real AI key through the write-only Super Admin control, configure push/email/SMS providers, perform a backup/restore drill, run physical iOS/Android Maestro and accessibility checks, complete legal/clinical review, activate real Super Admin accounts, prepare signed store builds, and complete the closed-clinic pilot.

## Honest completion boundary

The application is a broad, working client-demo build with live schema and verified server authorization. It is **not production-complete** until the external provider, physical-device, legal, clinical, backup, store, and pilot gates above are documented. Do not mark any external integration as verified merely because its adapter or mock succeeds.
