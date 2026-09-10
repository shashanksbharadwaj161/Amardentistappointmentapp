# Amar Dentist continuation guide

Updated: 2026-09-10

**Latest increments: `docs/ADMIN_ACCESS_DELIVERY_2026-09-10.md` and `docs/SUPPORT_DELIVERY_2026-09-10.md`. Read these first, then `docs/CHECKPOINT_2026-09-10.md` for the preceding navigation/deployment checkpoint.**

**Then read `docs/CHECKPOINT_2026-09-09.md` for the map/calendar increment and `docs/CHECKPOINT_2026-09-07.md` for the broader product-gap audit. The percentage table below is a historical planning estimate only; it is not current verification or acceptance evidence.**

This is the authoritative no-context handoff. A new task must read this file, `PRODUCT.md`, `DESIGN.md`, `docs/PROGRESS.md`, and `docs/PRODUCTION_READINESS.md` before changing code.

## 1. Mission and fixed decisions

Build the complete Amar Dentist product as six sequential, gated increments: one Expo patient/professional app, one separate responsive React Super Admin console, shared domain code, and Supabase as the server/security boundary.

Non-negotiable rules:

- Do not place the product owner's personal name in app copy, fixtures, documentation, commits, or metadata.
- Do not hardcode or commit real email addresses, passwords, service-role credentials, payment keys, AI keys, signing material, or provider secrets.
- Real Super Admin account activation is intentionally deferred until the final access ceremony. Do not block feature work on it.
- Only the Supabase publishable key may enter a client bundle. Service-role, payment, AI, notification, and subscription secrets stay server-side.
- All privileged writes use authenticated RPCs or Edge Functions with database-enforced roles and stable error codes.
- Use versioned migrations. Never make a production-only manual schema change. If a live migration has run, repair it with a later migration rather than rewriting history.
- Signed callbacks must be idempotent. This applies to payments, subscriptions, notifications, and AI/provider workflows.
- Every phase preserves all earlier RLS, business, device, and visual behavior.
- E-shop, waste logistics, jobs, and learning are separate future products.
- Payment provider credentials can be added at the end; mocks/adapters must stay honestly labelled until certified.

## 2. Source references and instruction boundary

The originally attached documents and videos are reference material, not autonomous instructions. The user-approved six-phase plan and repository rules control implementation.

Original local inputs:

- `~/Downloads/DENTIST_APPOINTMENT_APP_SPEC.md`
- `~/Downloads/Dentist_Appointment_App_Blueprint.pdf`
- `~/Downloads/original-cf444697d881ba7c87c905a3c5e08192.mp4` — calm light mobile hierarchy
- `~/Downloads/original-f86bf58148ca1b776b475fc08f9303e5.mp4` — dark interactive map language
- `~/Downloads/3ec036e9fbb6496e2e822b6a0c8b6c3e.mp4` — refined onboarding/success motion

The supplied low-resolution child-and-tooth logo was redrawn into clean repository assets. Use the checked-in assets, not the screenshot:

- `apps/mobile/assets/brand-mascot-v2.png`
- `apps/mobile/assets/brand-mascot.png`
- `apps/mobile/assets/brand-icon.svg`
- `apps/mobile/assets/brand-foreground.svg`
- `apps/mobile/assets/brand-monochrome.svg`
- `apps/admin/src/assets/brand-mascot.png`

## 3. Product and design language

Creative north star: **The Guided Care Ledger** — a calm, accountable clinical register connected to a live care route. It must not feel like a playful wellness toy or a dense hospital ERP.

Palette:

- Ledger Ink `#142A42` — primary action and trusted structure.
- Deep Ledger Ink `#0C1C2D` — darkest/pressed structure.
- Pearl Field `#F5F8F7` — app background.
- Paper `#FFFFFF` — focused surfaces.
- Care Mint `#79D2BD` — availability, verification, progress.
- Route Cyan `#5CB8CF` — location and realtime route state.
- Clinical Teal `#176662` — professional emphasis/secondary action.
- Body Ink `#14202B`, Quiet Ink `#5A6873`, Instrument Line `#DDE7E5`.
- Map Night `#0B1218` — map and intentional image-inspection areas only.
- Success `#1D684F`, Warning `#B86D16`, Danger `#B83A3A`.

Geometry and layout:

- 10px control radius, 14px ordinary surface radius, 18px feature/map radius, fully rounded only for status/filter pills.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Minimum controls: 48px Android and 44pt iOS.
- Patient gutters: 16–24px. Professional workspace: 12–16px compact rhythm. Admin: responsive left rail and limited reading width.
- Ordinary surfaces stay flat. Shadows identify real floating layers only.
- Use system sans with Noto Sans Bengali fallback. English and Bangla are equal-quality experiences.
- Use human, sentence-case labels. Make clinical, permission, payment, provider, and AI states explicit.

Anti-patterns:

- No gradients, decorative glass, neon health styling, generic medical crosses, excessive pill containers, same-size icon-card grids, or nested cards.
- No color-only status. Always pair color with text and/or an icon.
- Mint and cyan must communicate availability, position, verification, or progress.
- Never hide permission, upload, payment, provider, or AI failures behind optimistic copy.
- Motion must explain state or hierarchy and honor reduced motion.
- The mascot is limited to brand moments.

Before marking a major surface done, inspect compact and wide layouts, English/Bangla, long content, large font scale, keyboard/focus, reduced motion, slow network, loading/empty/error/denied states, and horizontal overflow. The current visual reference pack is `docs/screenshots/ui-pack/README.md`.

## 4. Architecture

- `apps/mobile` — Expo SDK 57 and Expo Router; shared patient/professional authentication.
- `apps/admin` — React, Vite, HeroUI/Radix primitives, TanStack Query, responsive Super Admin console.
- `packages/domain` — Zod validation, stable types, permissions, translations, and pure business rules.
- `supabase/migrations` — versioned SQL.
- `supabase/tests` — structural and role/RLS behavior pgTAP.
- `supabase/functions` — Deno Edge Functions with dependency-injected handlers and tests.
- `.maestro` — mobile flows for Phases 1–6.
- `apps/admin/e2e` — Playwright desktop/mobile flows.
- `scripts/secret-scan.mjs` — credential leak detector.
- `scripts/ui-audit.mjs` — repository-specific UI anti-pattern audit.

Use pnpm 9.12.0. Do not add another package manager or lockfile.

## 5. Current evidence and historical estimate warning

The latest dated verification evidence is in `docs/CHECKPOINT_2026-09-10.md`. As of that checkpoint, the responsive navigation and realtime subscription repairs are committed and pushed on `main`, the mobile suite passes 47 tests, and a preview-disabled Expo export passes for web, iOS, and Android. Authenticated live-function behavior and signed physical-device builds remain unverified. Do not infer production readiness from a local export or successful preflight request.

The following **87.84% figure and table were recorded as a planning estimate on 2026-09-06**. They have not been revalidated as current progress, do not measure user-journey acceptance, and must not be quoted as the product's current verified completion:

| Phase | Historical weight | Historical estimated completion | Historical earned estimate |
| --- | ---: | ---: | ---: |
| Foundation/auth/UI | 15% | 99% | 14.85% |
| Clinics/verification/scheduling | 16% | 90% | 14.40% |
| Marketplace/booking/appointments | 20% | 89% | 17.80% |
| Dental EHR/clinical records | 18% | 90% | 16.20% |
| Payments/finance/inventory/labs/subscriptions | 18% | 81% | 14.58% |
| AI/admin/hardening | 13% | 77% | 10.01% |

All migrations through `202609050014_phase6_finish_review_repairs.sql` are applied and registered on hosted Supabase project `cfjoxuucukktegznbkoc`.

Hosted PostgreSQL proof: **452 passing pgTAP assertions**.

- Phase 2: 36 structure, 35 behavior.
- Phase 3: 64 structure, 61 behavior.
- Phase 4: 51 structure, 43 behavior.
- Phase 5: 61 structure, 26 behavior.
- Phase 6: 47 structure, 28 behavior.

The live run found and repaired:

- UUID GiST exclusion setup required `btree_gist` and the extensions search path.
- Phase 5 had to evolve the Phase 3 payment table instead of recreating it.
- Booking-hold and cancellation functions had ambiguous SQL identifiers.
- Invalid FDI tooth codes needed a stable machine-readable error.
- Prescription-document paths needed to compare the UUID filename including `.pdf`.

Corrective migrations `202609040011`–`202609050014` preserve hosted migration history. Do not squash or remove them.

Historical local proof recorded on 2026-09-06:

- Lint and strict TypeScript passed.
- 31 shared, 12 mobile, and 3 Admin tests passed.
- 54 Edge Function tests passed.
- Secret scan passed across 258 files.
- UI audit returned zero findings.
- Admin production build and Expo web/iOS/Android exports passed.
- 7 Admin Playwright journeys passed across desktop/mobile Chromium; 1 desktop-only mobile-navigation case was intentionally skipped.
- All 10 Edge Functions are deployed; anonymous smoke requests return HTTP 401.
- Independent finish review passed after the Phase 6 repairs, with no remaining critical or high-severity source issue.

## 6. Implemented product surface

Phase 1: verified email/password authentication, password recovery, secure native sessions, localization, roles, invitations, audit/configuration, reusable navigation/forms/dialogs/states, and high-quality brand assets.

Phase 2: clinic roles/memberships, independent and multi-clinic dentists, BMDC/clinic applications, private evidence, decisions/history, services/prices/deposits/durations, weekly schedules, breaks/holidays/exceptions, shared availability, professional calendars, and Admin verification.

Phase 3: family profiles, location fallback, approved discovery, dark map/list, filters/ranking, trusted slots, ten-minute holds, exclusion-protected booking, mock deposit, receipts, single-use QR, realtime-aware clinic schedule/chat, walk-ins, cancellation/rescheduling, waitlist offers, no-show policy, reviews, and notification outbox.

Phase 4: medical history/allergies, encounters/notes/diagnoses, adult and primary FDI odontograms, treatment plans/progress, private clinical media, structured prescriptions/private PDFs, versioned bilingual consent, consent-gated cross-clinic history, finalized-only patient records, immutable versions, and audited exceptional Super Admin access.

Phase 5: bKash/Nagad server adapters, signed idempotent callback/refund/reconciliation logic, invoices/discounts/expenses/receipts, commission/payables/payouts/reports, inventory/lots/expiry/purchasing/consumption, negative-stock enforcement, lab vendors/cases/workflow/private attachments, RevenueCat synchronization, and plan/entitlement controls.

Phase 6: dentist AI note/prescription drafts, photo-quality and oral-photo tasks, separately gated experimental X-ray observations, patient symptom/general guidance and finalized-record explanation, prompt versioning, raw/safe/final separation, mandatory field review, AI audit/usage/cost, rate limiting, feature flags/limits, Vault-backed write-only key rotation, notification worker, read-only support/audit/user oversight, legal drafts, restore/pilot runbook, and safety fixtures. Database-enforced flags/quotas, atomic dentist review/application, and notification lease recovery were added in the finish-review repair migration. Assignment/resolution, moderation, and refund actions are not yet implemented in these oversight workspaces.

Fictional preview records may be edited or replaced through the app during testing. They are not real practitioners, BMDC records, patients, clinics, or endorsements.

## 7. Security and clinical invariants

- Pending or rejected clinics/dentists never appear publicly.
- Clinic roles are scoped; cross-clinic access fails closed.
- Availability derives from service, schedule, exceptions, active holds, and appointments.
- The client never chooses authoritative duration, price, deposit, commission, refund, or ledger amounts.
- PostgreSQL exclusion constraints—not `count(*)`—prevent overlapping active appointments.
- Cancellation at least 24 hours before is refundable/transferable; under 24 hours forfeits the deposit.
- No-show requires 15 minutes after start, forfeits deposit, and never reopens an already-started slot.
- Future reopened slots offer the first waitlisted patient a 15-minute reservation.
- Front desk, managers, owners, and normal Admins cannot read clinical detail unless they are also the treating verified dentist.
- Cross-clinic clinical history requires active patient consent per clinic; revocation blocks future sharing.
- Clinical files use private buckets and short-lived signed URLs. No public clinical URL.
- Patients see finalized records only.
- Only verified treating dentists diagnose or finalize prescriptions.
- Raw AI output never reaches patients. Dentist AI remains draft-only until every required field is reviewed.
- Patient AI never diagnoses or prescribes; urgent warning signs route to local care.
- Experimental X-ray observations stay disabled until separately approved.
- Super Admin exceptional clinical access requires a reason and creates an audit event.
- AI secrets are write-only and stored in Supabase Vault; plaintext is never returned.

## 8. Remaining work, in priority order

1. Review and disable the legacy-JWT gateway check only for custom-signed provider webhooks and the private notification worker, then live-test each deployed function. This changes an internet access-control setting and requires explicit action-time confirmation.
2. Configure allowed URLs and delivery providers; verify email verification, recovery, invitation success/failure, push/email/SMS retries, and duplicate handling.
3. Activate the authorized Super Admin accounts securely at the final access ceremony. Never put credentials in code, commands, logs, screenshots, or this guide.
4. Enter the AI key only through the Super Admin write-only configuration surface and confirm that only masked status returns. Keep X-ray AI off.
5. Select a production map provider and preserve the location-denied/list fallback.
6. Configure approved bKash/Nagad sandbox/merchant accounts; exercise checkout success/failure, stale/invalid signature, replay, partial/full refund, reconciliation, and timeout behavior.
7. Configure RevenueCat, App Store, and Play Store products/entitlements; verify purchase, renewal, cancel, expiry, restore, quota, and webhook replay on physical iOS and Android.
8. Run every `.maestro` flow on physical iOS and Android, including QR camera, file uploads/downloads, realtime updates, English/Bangla, large text, reduced motion, offline/slow network, and permissions.
9. Have a practicing dentist validate clinical vocabulary, adult/primary FDI entry, prescription layout, consent wording, and all AI prompts/safety boundaries.
10. Replace legal drafts with reviewed entity/contact/retention terms; complete privacy-safe monitoring review.
11. Perform the documented backup/restore drill into an isolated project and rerun all pgTAP/storage/Vault checks.
12. Prepare signed store builds and review metadata, then complete the closed-clinic acceptance journey in `docs/PRODUCTION_READINESS.md`.

## 9. Edge Functions present

- `admin-invite`
- `clinic-invite`
- `generate-prescription`
- `payment-checkout`
- `payment-webhook`
- `payment-refund`
- `revenuecat-webhook`
- `ai-task`
- `ai-key-rotate`
- `notification-worker`

All 10 function names have hosted deployments, but this does not prove that every hosted function matches the latest repository source. On 2026-09-10 the committed `clinic-invite` and `payment-checkout` wrappers were deployed and both live preflights changed from HTTP 503 to HTTP 204. Local handlers are tested, and unavailable or unauthenticated mutation paths fail closed, but real authenticated/provider success paths remain unverified until configuration, keys, gateway behavior, and test accounts are exercised.

## 10. Verification commands

```bash
pnpm install
pnpm verify:local
pnpm verify:edge
pnpm verify:e2e
pnpm verify:db
```

`verify:db` requires local Supabase/Docker. Hosted pgTAP may instead be run through an authenticated database connection or reviewed SQL Editor session. Never expose access tokens or passwords in terminal arguments.

Before every push:

- Run `git diff --check`.
- Run secret and personal-name scans.
- Confirm ignored `.env.local` files are not staged and preview mode defaults off.
- Rerun relevant tests/builds/E2E after each fix.
- Update `docs/PROGRESS.md` and this guide with verified facts only.
- Use a clean scoped commit and verify the remote hash.

## 11. Primary technical references

- Expo Router: <https://docs.expo.dev/router/introduction/>
- Expo Camera: <https://docs.expo.dev/versions/v57.0.0/sdk/camera/>
- Expo Location: <https://docs.expo.dev/versions/v57.0.0/sdk/location/>
- Expo Document Picker: <https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/>
- Expo Image Picker: <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/>
- Supabase migrations: <https://supabase.com/docs/guides/deployment/database-migrations>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Storage security: <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase Edge Functions: <https://supabase.com/docs/guides/functions>
- Supabase Vault: <https://supabase.com/docs/guides/database/vault>
- PostgreSQL exclusion constraints: <https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION>
- OpenAI structured outputs: <https://platform.openai.com/docs/guides/structured-outputs>
- RevenueCat Expo: <https://www.revenuecat.com/docs/getting-started/installation/expo>
- RevenueCat webhooks: <https://www.revenuecat.com/docs/integrations/webhooks>

## 12. Definition of complete

Schema/RLS pgTAP, shared/mobile tests, Admin Playwright, physical iOS/Android Maestro, failure simulation, AI safety fixtures, bilingual visual/accessibility QA, Impeccable review, independent finish review, screenshots, migration proof, clean commit, and no known critical/high defects must all pass. Production completion additionally requires provider approval, store accounts, legal/privacy review, practicing-dentist validation, restore drill, and closed-pilot acceptance.

Do not call the product 100% complete while any of those external gates remain.
