# Amar Dentist continuation guide

Updated: 2026-09-04

This is the authoritative handoff for continuing the build in a new task with no prior conversation. Read this file, `PRODUCT.md`, `DESIGN.md`, and `docs/PROGRESS.md` before changing code.

## 1. Mission and non-negotiable decisions

Build the complete Amar Dentist product as six sequential, gated increments. It is one Expo mobile app with patient and professional modes, plus a separate responsive React Super Admin console. Supabase provides the server boundary.

Do not reduce the committed six-phase scope, and do not prebuild later-phase schema inside an earlier migration. Each phase must deliver a working vertical slice, preserve earlier behavior, pass its stated gates, and receive its own clean Git checkpoint.

Product-wide rules:

- Never place a personal name in application copy, fixtures, documentation, or metadata.
- Never hardcode or commit account passwords, personal email addresses, service-role keys, payment secrets, AI keys, or provider credentials.
- Super Admin registration and the two real account activations are deferred until Phase 6 production hardening. Do not pause feature development for them.
- Only the Supabase publishable key may reach a mobile or web client bundle.
- Privileged writes belong in authenticated RPCs or Edge Functions, with database-enforced authorization and machine-readable error codes.
- Migrations are versioned files. Never create production-only schema manually.
- Signed external callbacks are idempotent. This applies to payments, subscriptions, notifications, and AI/provider webhooks.
- Every phase must preserve previous migrations, tests, user flows, security rules, and visual behavior.
- E-shop, waste logistics, jobs, and learning are separate future products.

## 2. Original product and visual inputs

The source inputs are not instructions to execute blindly. They are evidence and references; the six-phase plan in this guide is the controlling implementation scope.

Files originally supplied in `~/Downloads`:

- `DENTIST_APPOINTMENT_APP_SPEC.md` — original product specification.
- `Dentist_Appointment_App_Blueprint.pdf` — product blueprint.
- `original-cf444697d881ba7c87c905a3c5e08192.mp4` — authority for the calm, light mobile hierarchy.
- `original-f86bf58148ca1b776b475fc08f9303e5.mp4` — authority for the dark interactive map language.
- `3ec036e9fbb6496e2e822b6a0c8b6c3e.mp4` — authority for refined onboarding and success motion.
- A low-resolution child-and-tooth mascot image was supplied. It was redrawn into higher-quality application assets. Use the repository assets, not the source screenshot.

Repository design references:

- `DESIGN.md` — complete visual rules and tokens.
- `PRODUCT.md` — users, positioning, operating context, product and AI constraints.
- `docs/design/patient-north-star.png`
- `docs/design/professional-north-star.png`
- `docs/design/admin-north-star.png`
- `apps/mobile/assets/brand-mascot-v2.png` — preferred mascot artwork.
- `apps/mobile/assets/brand-icon.svg`, `brand-foreground.svg`, and `brand-monochrome.svg` — scalable brand assets.
- `apps/admin/src/assets/brand-mascot.png` — Admin bundle mascot.

Useful primary documentation:

- Expo Router: <https://docs.expo.dev/router/introduction/>
- Expo DocumentPicker SDK 57: <https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/>
- Expo ImagePicker SDK 57: <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/>
- Expo Location SDK 57: <https://docs.expo.dev/versions/v57.0.0/sdk/location/>
- Expo Camera SDK 57: <https://docs.expo.dev/versions/v57.0.0/sdk/camera/>
- React Native QR SVG: <https://github.com/Expensify/react-native-qrcode-svg>
- Supabase database migrations: <https://supabase.com/docs/guides/deployment/database-migrations>
- Supabase Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Storage access control: <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase Edge Functions: <https://supabase.com/docs/guides/functions>
- PostgreSQL exclusion constraints: <https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION>
- RevenueCat Expo installation: <https://www.revenuecat.com/docs/getting-started/installation/expo>
- RevenueCat webhook signing and retry guidance: <https://www.revenuecat.com/docs/integrations/webhooks>

## 3. Visual language and Impeccable rules

Creative north star: **The Guided Care Ledger**. The interface should feel like a carefully kept clinical register connected to a live care route. It is neither a playful wellness app nor a dense hospital ERP.

Core palette:

- Ledger Ink `#142A42`: primary actions and trusted structure.
- Deep Ledger Ink `#0C1C2D`: pressed and darkest structural states.
- Pearl Field `#F5F8F7`: main background.
- Paper `#FFFFFF`: focused surfaces.
- Care Mint `#79D2BD`: availability, verification, progress.
- Route Cyan `#5CB8CF`: location, live route, realtime state.
- Clinical Teal `#176662`: professional emphasis and secondary actions.
- Body Ink `#14202B`, Quiet Ink `#5A6873`, Instrument Line `#DDE7E5`.
- Map Night `#0B1218`: only for map and intentional image-inspection surfaces.
- Success `#1D684F`, Warning `#B86D16`, Danger `#B83A3A`.

Geometry and rhythm:

- Controls: 10px radius; ordinary surfaces: 14px; feature/map surfaces: 18px; status/filter pills only: fully rounded.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Minimum controls: 48px on Android and 44pt on iOS.
- Patient screens use 16–24px gutters. Professional screens use 12–16px compact rhythm. Admin uses a responsive left rail and focused maximum reading widths.
- Ordinary surfaces remain flat. Shadows represent a real floating layer, never generic decoration.

Typography and copy:

- Use platform system sans, with Noto Sans Bengali fallback.
- Display text is reserved for major patient moments and success states.
- Labels are human, specific, and normally sentence case.
- English and Bangla are equal-quality first-class experiences.
- Clinical, permission, payment, and AI state must be explicit and plain-spoken.

Anti-patterns:

- No gradients, decorative glass, neon healthcare imagery, generic medical crosses, or excessive rounded cards.
- No repeated same-size icon-card dashboard grids and no nested cards.
- No color-only state; pair status color with words and/or icons.
- No decorative mint/cyan. Signal colors must mean availability, position, verification, or progress.
- No optimistic hiding of permission, payment, upload, or AI failures.
- No unbounded motion. Respect reduced-motion settings; animations must explain state or hierarchy.
- The mascot appears only at brand moments; it is not general decoration.

Before declaring a major screen done, check compact and wide layouts, English and Bangla, long content, large font scaling, keyboard/focus behavior, reduced motion, slow network, empty, loading, error, overflow, and permission-denied states.

## 4. Workspace architecture

- `apps/mobile` — Expo SDK 57 and Expo Router; patient/professional modes share authentication and domain packages.
- `apps/admin` — React, Vite, HeroUI/Radix primitives, TanStack Query, responsive Super Admin console.
- `packages/domain` — Zod schemas, stable shared types, permissions, translations, and pure business rules.
- `supabase/migrations` — versioned SQL only.
- `supabase/tests` — pgTAP structural and behavioral RLS tests.
- `supabase/functions` — Deno Edge Functions with injected dependencies and unit tests.
- `.maestro` — mobile end-to-end flows.
- `apps/admin/e2e` — Playwright desktop/mobile flows and verification screenshots.
- `scripts/secret-scan.mjs` — committed-secret detector.
- `scripts/ui-audit.mjs` — repository-specific Impeccable anti-pattern checks.

Use pnpm 9.12.0. Do not introduce another package manager or duplicate lockfile.

## 5. Current implementation status

Gate-weighted whole-app completion: **69.85%**.

| Phase | Weight | Completion | Earned overall |
| --- | ---: | ---: | ---: |
| 1 — Foundation/auth/UI | 15% | 99% | 14.85% |
| 2 — Clinics/verification/scheduling | 16% | 75% | 12.00% |
| 3 — Marketplace/booking/appointments | 20% | 80% | 16.00% |
| 4 — Dental EHR/clinical records | 18% | 75% | 13.50% |
| 5 — Payments/finance/inventory/labs/subscriptions | 18% | 75% | 13.50% |
| 6 — AI/admin completion/production hardening | 13% | 0% | 0% |

These numbers are gate-weighted, not based on file count. Phases 2–5 do not receive full credit until live migration/RLS and physical-device checks pass.

### Phase 1 implemented

- TypeScript monorepo with Expo mobile, separate React Admin, shared domain, Supabase, test, and verification tooling.
- Verified email/password sign-up, sign-in, email verification, password recovery/update, secure native session storage, and persistent locale.
- Patient/professional mode switching and English/Bangla localization.
- Profiles, roles, invitations, audit log, configuration, service-controlled bootstrap, and invitation-only Admin promotion.
- Reusable screen, button, input, dialog, navigation, loading, error, empty, and denied-state foundations.
- Higher-quality mascot and icon asset family.
- Phase 1 schema and tests were deployed and verified on Supabase earlier. Do not repeat Super Admin activation until Phase 6.

### Phase 2 implemented locally

Database migration: `supabase/migrations/202609030002_phase2_clinics_scheduling.sql`

It contains:

- PostGIS support and verification/scheduling enums.
- Clinics, scoped clinic memberships, staff invitations, dentist profiles, private verification documents, append-only verification decisions, services, weekly blocks, breaks, and exceptions.
- Independent one-person clinics and multi-clinic dentist membership.
- `has_clinic_role`, `can_manage_clinic`, and `is_verified_dentist` helpers.
- RPCs for clinic/dentist application, evidence registration, staff invitation/acceptance, application decisions, services, schedules, breaks, exceptions, and generated availability.
- Fail-closed invitation record, delivery, activation, revocation, and cleanup behavior.
- Private `verification-documents` storage bucket and policies.
- Pending clinic/dentist invisibility, clinic-scoped membership policies, direct-write revocation, and server-side authorization.

Phase 2 pgTAP:

- `supabase/tests/phase2_structure.test.sql` — 36 assertions.
- `supabase/tests/phase2_access_behavior.test.sql` — 32 assertions.

Shared domain:

- `packages/domain/src/phase2.ts` — types and Zod validation.
- `packages/domain/src/availability.ts` — pure availability engine respecting schedules, breaks, closures, partial exceptions, and extra hours.
- `packages/domain/src/phase2.test.ts` — five scheduling/validation tests.
- `packages/domain/src/i18n.ts` — bilingual Phase 2 copy.

Mobile professional flows:

- `apps/mobile/app/professional/index.tsx` — status, clinics, memberships, and next actions.
- `clinic-application.tsx` — clinic details and required private license upload.
- `dentist-application.tsx` — BMDC profile and required private credential upload.
- `calendar.tsx` — day/week availability over the shared server engine.
- `manage-schedule.tsx` — duration, price, deposit, weekly hours, breaks, closures, and one-off exceptions.
- `team.tsx` — manager, dentist, and front-desk invitation.
- `apps/mobile/src/lib/phase2.ts` — live/demo queries and RPCs. Native evidence uploads use `ArrayBuffer`; web uses `File`/`Blob`.
- `.maestro/phase2-clinic-scheduling.yaml` — preview flow for Phase 2 professional surfaces.

Admin verification:

- `apps/admin/src/lib/phase2.ts` — queue, signed private evidence links, decision history, and review RPC.
- `apps/admin/src/components/VerificationWorkspace.tsx` — search, evidence, checklist, reason, approve/request-changes/reject, and prior history.
- `apps/admin/e2e/phase1.spec.ts` — both Phase 1 access and Phase 2 review flows across desktop/mobile projects.

Edge Functions:

- `supabase/functions/admin-invite` — Phase 1 invitation delivery and fail-closed activation.
- `supabase/functions/clinic-invite` — Phase 2 scoped staff invitation; existing-account and new-account paths; revocation and auth-user cleanup on failure.

### Phase 3 expanded slice implemented locally

Database migration: `supabase/migrations/202609030003_phase3_marketplace_booking.sql`

- Patient/family profiles, protected holds, active appointment exclusion, mock payment ledger, appointment history, single-use check-in tokens, waitlist, verified reviews, chat tables, and notification outbox.
- Approved-only marketplace RPC with specialty, gender, language, price, rating, radius, and distance filters.
- Shared availability now removes active appointments and unexpired holds.
- Slot booking uses a ten-minute server hold, service-derived financial/duration values, advisory transaction locks, hold exclusion, and appointment exclusion.
- Mock confirmation is idempotent; cancellation implements the 24-hour rule; QR redemption is single-use; waitlist offers expire after 15 minutes; no-show cannot be recorded before 15 minutes.
- `supabase/migrations/202609030004_phase3_appointment_experience.sql` adds trusted walk-ins, verified-dentist completion, participant-only chat writes, and RLS-aware Realtime publication.
- `supabase/migrations/202609030005_phase3_reschedule_waitlist.sql` adds atomic rescheduling and exclusion-protected 15-minute waitlist reservations/confirmation.
- `supabase/migrations/202609040006_phase3_clinic_operations.sql` adds clinic-scoped guest identities, atomic guest walk-ins, and authorized clinic schedule, waitlist, and inbox RPCs.
- `supabase/migrations/202609040007_phase3_waitlist_expiry.sql` commits expired-offer cleanup in a separate non-throwing RPC so timed-out offers cannot remain indefinitely actionable.
- `supabase/tests/phase3_structure.test.sql` now contains 64 assertions.
- `supabase/tests/phase3_booking_behavior.test.sql` contains 61 assertions including trusted pricing, overlap rejection, idempotency, cancellation reopening, rescheduling, waitlist reservation and committed expiry, QR replay resistance, completion, reviews, chat, guest walk-ins, clinic query isolation, no-show behavior, RLS, and auditing.

Shared/mobile:

- `packages/domain/src/phase3.ts`, `booking.ts`, and `phase3.test.ts` define and test patient, marketplace, hold, cancellation, no-show, waitlist, and ranking rules.
- `apps/mobile/app/patient/discover.tsx` provides dark map/list discovery, full filter controls, foreground location, and accessible dentist cards.
- `apps/mobile/app/patient/dentist.tsx` provides patient selection, server availability, protected hold, trusted mock deposit, confirmation, and receipt.
- `apps/mobile/app/patient/profiles.tsx` manages self and family profiles.
- `apps/mobile/app/patient/appointments.tsx` provides history, policy-aware cancellation, and clinic messaging entry.
- The appointments surface also provides atomic rescheduling entry and short-lived single-use QR presentation using only an opaque token.
- `apps/mobile/app/patient/chat.tsx` provides participant-only messaging with realtime inserts, polling fallback, virtualized history, keyboard avoidance, and explicit sender/time accessibility labels.
- `apps/mobile/app/patient/waitlist.tsx` provides masked dated patient requests, active-state filtering, localized dates, polling, and protected offer acceptance.
- `apps/mobile/app/patient/review.tsx` provides verified completed-visit ratings and comments.
- `apps/mobile/app/professional/operations.tsx`, `walk-in.tsx`, `check-in.tsx`, and `inbox.tsx` complete the clinic-side appointment lifecycle with explicit clinic, dentist, and service context plus a responsive split workspace.
- Expo Camera scans QR-only opaque tokens; a manual fallback remains available when camera permission is denied.
- `apps/mobile/src/lib/phase3.ts` connects Supabase RPCs and deterministic preview fixtures.
- Three Phase 3 Maestro flows cover booking, patient follow-up, and clinic operations previews.

Verified in-browser at compact and tablet widths: English and Bangla review, waitlist acceptance, clinic schedule actions, guest walk-in creation, check-in fallback, and clinic inbox/thread entry, in addition to the prior discovery, booking, cancellation, and messaging flows. No horizontal overflow or runtime errors were found. The map remains an original interactive visual canvas, not a production street-map provider.

### Phase 4 clinical slice implemented locally

- `supabase/migrations/202609040008_phase4_clinical_foundation.sql` adds thirteen clinical/consent/version tables, private clinical-media and prescription buckets, guarded RPCs, immutable finalization, version capture, and clinical RLS.
- `supabase/tests/phase4_structure.test.sql` contains 51 structural assertions; `phase4_access_behavior.test.sql` contains 43 behavioral/RLS assertions.
- `packages/domain/src/phase4.ts` provides validated clinical inputs and adult/primary FDI rules; five Phase 4 shared tests pass.
- `apps/mobile/app/professional/encounter.tsx` connects a checked-in appointment to structured notes, diagnoses, FDI observations, prescriptions, treatment plans, private files, and atomic finalization/completion.
- `apps/mobile/app/patient/records.tsx` and `patient/consent.tsx` provide history/allergy maintenance, finalized record viewing, short-lived private downloads, and explicit versioned consent/revocation.
- `supabase/functions/generate-prescription` builds a server-side PDF, stores it privately, registers the path through caller authorization, and returns a five-minute signed URL. Six Edge Function tests pass.
- English browser QA passed at 320px and 730px without overflow for records and consent. Physical English/Bangla/device/file-picker tests remain outstanding.

### Phase 5 operational and revenue slice implemented locally

- `supabase/migrations/202609040009_phase5_finance_operations.sql` adds payments, signed-event stores, refunds, invoices/items, expenses, commission/payable ledgers, payouts, suppliers, purchase orders/receipts, lot/expiry inventory, atomic movements, lab vendors/cases/events/private attachments, subscription plans/subscriptions, and guarded RPCs.
- Trusted checkout preparation derives the deposit from the appointment row. Provider callbacks are HMAC-verified and database-idempotent; confirmed payments write gross/commission ledger entries exactly once. Refund preparation checks role, status, prior refunds, amount, and idempotency before a provider request.
- `supabase/functions/payment-checkout`, `payment-webhook`, and `payment-refund` provide configurable bKash/Nagad server adapters. Provider secrets remain server-only. `revenuecat-webhook` verifies both its authorization token and the timestamped raw-body HMAC in constant time, rejects signatures older than five minutes, and synchronizes renewal/cancellation/expiry events idempotently.
- `apps/mobile/app/patient/payments.tsx` shows trusted deposit checkout, provider-confirmed history, RevenueCat offerings, purchase, and restoration. `react-native-purchases` is dynamically loaded only on native platforms and uses public platform SDK keys.
- `apps/mobile/app/professional/business.tsx` provides clinic-scoped 30-day finance, expenses, commission/payables, stock/reorder/expiry, lab workflow, and plan status at compact and split widths.
- `apps/admin/src/components/FinanceConfiguration.tsx` adds Super Admin-only audited commission controls and masked/server-only subscription configuration context. No provider secret is displayed or accepted in the browser.
- `packages/domain/src/phase5.ts` centralizes validated finance/inventory/lab inputs and pure invoice, commission, and stock rules.
- `supabase/tests/phase5_structure.test.sql` has 61 assertions; `phase5_finance_behavior.test.sql` has 26 assertions covering trusted amounts, cross-user denial, idempotent callbacks, exact ledger reconciliation, subscription replay, atomic stock, negative-stock rejection, expense reporting, and refund replay.
- `.maestro/phase5-business-operations.yaml` covers the professional finance/inventory/lab preview. English and Bangla browser QA passed at 320px and 730px without horizontal overflow for professional business operations; the patient payment/subscription surface passed at 320px.

Phase 5 remains externally gated on hosted migration/semantic pgTAP, certified merchant endpoints and credentials, real callback/refund/reconciliation exercises, RevenueCat/App Store/Play Store product setup, physical purchase/restore testing, and pilot payout acceptance. Do not describe configurable adapters as provider-certified until those checks pass.

## 6. Verified evidence at this checkpoint

Successful on 2026-09-04:

- `pnpm verify:local`
  - lint passed across shared, mobile, and Admin.
  - strict TypeScript passed across shared, mobile, and Admin.
  - 26 shared tests passed, including 6 Phase 5 finance/inventory rule tests.
  - 12 mobile component/link/clinical/operations tests passed.
  - 3 Admin tests passed, including Super Admin revenue controls.
  - secret scan passed across 204 files.
  - UI audit returned zero findings.
  - Admin production build passed.
  - Expo production export passed for web, iOS, and Android.
- `pnpm verify:edge` — 40 Edge Function tests passed: 16 invitation, 6 private prescription-document, and 18 payment/subscription tests.
- `pnpm verify:e2e` — 7 Playwright tests passed across desktop and mobile Chromium, including revenue controls; one desktop-only mobile-navigation test was intentionally skipped.
- Phase 2 migration and pgTAP files were syntactically parsed as PostgreSQL using `pglast`: 86 migration statements, 75 access-test statements, and 40 structure-test statements.
- Phase 3 migrations and pgTAP files were syntactically parsed using `pglast`: 87 core-migration statements, 9 experience-migration statements, 8 reschedule/waitlist statements, 12 clinic-operations statements, 5 waitlist-expiry statements, 68 structure-test statements, and 141 behavior-test statements. This remains syntax evidence, not semantic database proof.
- `git diff --check` passed.
- Phase 4 migration and pgTAP files parsed as PostgreSQL: 101 migration statements, 55 structure-test statements, and 111 behavior-test statements. This is syntax evidence, not semantic database proof.
- Phase 4 browser QA passed at 320px and 730px for patient records and consent without horizontal overflow; the consent controls expose explicit radio and checkbox semantics.
- Phase 5 migration and its 87 pgTAP assertions parse as PostgreSQL. This is syntax evidence, not semantic database proof.
- Phase 5 professional finance/inventory/lab QA passed in English and Bangla at 320px and 730px with no horizontal overflow; patient payment/subscription QA passed at 320px.

Not yet proven:

- The Phase 2 migration has not run against the live Supabase PostgreSQL instance.
- Phase 2 pgTAP has not run semantically against a database.
- `clinic-invite` has not been deployed or live-tested.
- Physical iOS/Android Maestro runs are outstanding.
- English/Bangla large-text and reduced-motion physical visual QA is outstanding.
- Phase 4 migration/RLS, private Storage, and prescription PDF delivery have not been deployed or semantically verified on the hosted project.
- Phase 4 physical-device file handling and clinical validation are outstanding.
- Phase 3 production map provider, notification processing, live migration/RLS proof, physical QR-camera verification, and device E2E are outstanding.
- Phase 5 live migration/RLS, real provider certification and callbacks, RevenueCat/store configuration, physical purchases/restores, and real payout reconciliation are outstanding.

Do not describe those items as passed based on syntax parsing or web preview alone.

## 7. Supabase state and safe continuation

The selected Supabase project reference is `cfjoxuucukktegznbkoc`. This identifier is not a secret. Phase 1 is live. The local client environment uses ignored files and must stay uncommitted.

The Supabase CLI is currently not authenticated, and local database verification cannot start because Docker/Podman is not installed. Browser automation was not authorized to claim the signed-in Supabase dashboard. Do not work around that browser boundary and do not expose credentials in terminal arguments.

Preferred safe resolution, in order:

1. Authenticate the Supabase CLI interactively without logging the token, or obtain explicit user-performed dashboard execution.
2. Link the repository to project `cfjoxuucukktegznbkoc`.
3. Review pending migrations with a dry-run/diff where possible.
4. Apply `202609030002_phase2_clinics_scheduling.sql`.
5. Run the two Phase 2 pgTAP files against the actual project.
6. Deploy `clinic-invite` and verify unauthenticated, unauthorized, successful existing-user, successful new-user, and delivery-failure paths.
7. Apply the Phase 3 migrations in order: `202609030003_phase3_marketplace_booking.sql`, `202609030004_phase3_appointment_experience.sql`, `202609030005_phase3_reschedule_waitlist.sql`, `202609040006_phase3_clinic_operations.sql`, then `202609040007_phase3_waitlist_expiry.sql`.
8. Run both Phase 3 pgTAP files against the actual project, including the concurrent-booking and waitlist-hold cases.
9. Record proof in `docs/PROGRESS.md`; never paste tokens, email addresses, or passwords into the repository.
10. Apply `202609040008_phase4_clinical_foundation.sql`; run both Phase 4 pgTAP files; deploy and verify `generate-prescription` plus private Storage.
11. Apply `202609040009_phase5_finance_operations.sql`; run both Phase 5 pgTAP files; deploy payment and RevenueCat functions only after their server secrets are configured.
12. Use payment-provider sandbox accounts to verify create, failure, replay, refund, reconciliation, and timing behavior. Then configure RevenueCat/store products and run purchase/renew/cancel/expire/restore on physical iOS and Android.

Before applying the Phase 2 migration, pay special attention to:

- PostGIS types/functions in the extensions schema.
- Exact RPC signatures in revoke/grant statements.
- Availability timestamp/date conversions in `Asia/Dhaka`.
- RLS policy qualification and avoidance of recursive membership checks.
- Append-only verification history and private evidence visibility.
- Invitation activation only after confirmed delivery.

## 8. Exact next actions

1. Resolve Phase 2 live database verification using the safe path above.
2. Run `.maestro/phase2-clinic-scheduling.yaml` on physical iOS and Android devices.
3. Re-run `pnpm verify:local`, `pnpm verify:edge`, `pnpm verify:e2e`, and database tests after any fix.
4. Mark Phase 2 100% only after pending visibility, cross-clinic isolation, and exception-driven availability are proven on live PostgreSQL and physical mobile checks pass.
5. Deploy notification processing and verify idempotent retry/failure handling.
6. Select and integrate a production map provider only when its credential and billing constraints are confirmed; preserve the accessible list and location-denied fallback.
7. Run physical QR-camera and all Phase 3 Maestro flows on iOS and Android.
8. Apply and semantically verify `202609040008_phase4_clinical_foundation.sql`, its two pgTAP suites, and the `generate-prescription` Edge Function.
9. Run the Phase 4 Maestro flow and clinical file upload/download on physical iOS and Android.
10. Do not edit an already-applied migration after deployment; add a corrective migration instead.

Suggested commands:

```bash
pnpm install
pnpm verify:local
pnpm verify:edge
pnpm verify:e2e
pnpm verify:db
```

`pnpm verify:db` requires a functioning local Supabase/Docker environment. If validating the hosted database instead, document the exact safe commands and results without secrets.

## 9. Phase 3 requirements

Deliver a patient marketplace and trustworthy appointment lifecycle:

- Patient and dependant/family profiles.
- Location permission with a non-blocking manual-location fallback.
- Dark map plus accessible list discovery.
- Approved dentist and clinic profiles only.
- Filters for specialty, price, gender, language, rating, availability, and open-now.
- Ranking by distance, rating, and relevant availability.
- Trusted service/slot selection.
- Ten-minute server-side slot holds.
- Duration and deposit derived from database records, never client input.
- PostgreSQL exclusion constraint using `btree_gist` and `tstzrange` against overlapping active appointments.
- Mock payment first, then confirmation, receipt, QR check-in, realtime schedule, walk-ins, cancellation, rescheduling, waitlist, no-show, reviews, patient-clinic chat, and notification framework.

Required policies:

- At least 24 hours before: deposit refundable or transferable.
- Under 24 hours: deposit forfeited.
- No-show after 15 minutes: deposit forfeited and an already-started slot never reopens.
- Reopened future slot: first waitlisted patient receives a 15-minute reservation.

Required Phase 3 proof:

- Concurrent booking produces exactly one winner.
- Expired holds release correctly.
- QR check-in tokens cannot be replayed.
- Realtime changes appear without refresh.

## 10. Phase 4 requirements

Add medical history, allergies, encounters, progress notes, diagnoses, adult and primary FDI odontograms, tooth/surface observations, treatment plans/progress, clinical photos/X-rays, prescriptions/items, private downloadable prescriptions, and versioned bilingual checkbox consent.

Clinical access invariants:

- Treating verified dentists can read/write authorized clinical data.
- Front desk, managers, owners, and ordinary Admins cannot read clinical details unless also the treating dentist.
- Super Admin access is exceptional and every read/export/change is audited.
- Only verified dentists can diagnose or finalize prescriptions.
- Cross-clinic history requires explicit patient consent per clinic; revocation blocks future sharing.
- Edits preserve before/after versions, author, reason, and timestamp.
- Storage never exposes public clinical URLs; patients receive finalized records only.

## 11. Phase 5 requirements

Replace mock deposits with bKash and Nagad server-side checkout, signed idempotent webhooks, refunds, and reconciliation. Add invoices, line items, balances, discounts, expenses, receipts, configurable commission, clinic payable ledger/payouts, and reports.

Add inventory items/units/lots/expiry/movements, suppliers, purchase orders, treatment consumption, reorder/expiry alerts, and a database rule preventing silent negative stock.

Add lab vendors/cases/attachments/workflow/dates/cost/delivery/invoice linkage.

Add RevenueCat Patient Plus and Dentist/Clinic Pro with renewal, cancellation, expiry, restoration, usage limits, and configurable entitlements. Essential booking, records, consent, and messaging remain free.

## 12. Phase 6 requirements

Dentist AI may draft structured notes/prescriptions, assess photo quality, describe non-diagnostic visible photo observations, and provide separately labelled experimental X-ray observations. Every field requires dentist review before finalization.

Patient AI may explain finalized records, collect symptoms, offer general guidance/urgency, and route into booking. It must never diagnose or prescribe.

Store task/prompt version, provider/model, input, raw output, dentist changes, final output, reviewer/timestamps, usage, and estimated cost. Raw AI output must never reach patients.

Finish the Super Admin console for users, clinics, verification, disputes, refunds, moderation, plans, commissions, usage, audit investigation, AI provider/model, flags/limits, and write-only API-key rotation. Plaintext keys can never be read back.

Finish notifications, rate limits, abuse protection, privacy-safe monitoring, backup/restore drill, store builds/review preparation, closed-clinic pilot, and the deferred real Super Admin account activation.

Production completion also requires payment-provider approval, app-store accounts, privacy/legal review, and practicing-dentist clinical validation. Never imply these external approvals exist until documented.

## 13. Definition of done for every phase

- Schema/RLS: pgTAP.
- Shared business rules: Vitest.
- Mobile components: React Native Testing Library.
- Mobile E2E: Maestro on iOS and Android.
- Admin E2E: Playwright.
- Payment/webhook failure simulation where applicable.
- AI safety and prompt-injection fixtures where applicable.
- English/Bangla visual QA, font scaling, reduced motion, slow network, empty/error/overflow states.
- Impeccable UI review and independent finish review for every major surface.
- No known critical or high-severity defects.
- Working build, migration proof, screenshots, test results, progress update, clean commit, and push.

## 14. Git and handoff discipline

- Preserve unrelated user changes.
- Never use destructive reset/checkout commands.
- Before a checkpoint: run `git diff --check`, secret scan, tests, builds, and relevant E2E.
- Make phase-scoped commits. If an incomplete external gate must be checkpointed, say so precisely in the commit and `docs/PROGRESS.md`.
- Push only verified repository content. Ignored environment files must remain local.
- After each push, confirm the remote branch contains the commit.
- Keep this guide and `docs/PROGRESS.md` current so another task can resume without conversation history.
