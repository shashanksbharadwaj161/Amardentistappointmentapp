# Delivery gates

## Phase 1 — Foundation, authentication, and UI system

Implemented:

- Expo mobile app and separate React admin console.
- Shared typed roles, permissions, validation, result contracts, and English/Bangla copy.
- Verified email/password sign-up, sign-in, recovery-link password update, secure native session storage, and persisted locale sync.
- Service-controlled Super Admin bootstrap, invitation-only Admin promotion, profile/config/audit schema, RLS, and privileged invitation Edge Function.
- Responsive accessible UI foundation, reduced-motion support, permission-denied state, and honest unavailable states.
- HeroUI v3 action/status primitives and an Animate UI source-owned dialog with keyboard focus restoration.
- Unit/component/interaction tests, behavioral RLS pgTAP coverage, Maestro flow, desktop/mobile Playwright screenshots, secret scanner, and Impeccable detector.

Local gate status on 2026-09-02:

- Clean lint and strict TypeScript checks.
- 10 unit/component tests passed across shared, mobile, and admin packages.
- 8 Edge Function tests passed across authentication, authorization, validation, fail-closed delivery cleanup, activation, and audit behavior.
- 3 Playwright checks passed across desktop and mobile Chromium; one intentional desktop skip.
- Secret scan passed and the Impeccable anti-pattern detector returned no findings.
- Expo production exports passed for web, iOS, and Android; the admin production build passed with the animated dialog code-split.

External checks still required before the Phase 1 commit can be closed:

- Create/link the selected Supabase project, apply the migration, and run `pnpm verify:db`.
- Verify live email confirmation, password recovery, and invitation delivery.
- Run the Maestro flow on physical iOS and Android devices.
- Supply final signing accounts before store builds.

## Phase 2 — Clinics, verification, and scheduling

Implemented locally:

- Clinic ownership and scoped manager, dentist, and front-desk memberships.
- Independent and multi-clinic dentist model.
- Dentist and clinic application forms with private evidence uploads.
- Append-only approval/rejection/request-changes history and responsive Admin review workspace.
- Clinic services, prices, deposits, durations, weekly schedule blocks, breaks, closures, and one-off availability exceptions.
- Shared availability rules plus professional day/week calendars.
- Fail-closed clinic invitation delivery and activation.
- Phase 2 migration, 68 pgTAP assertions, 5 shared scheduling tests, 8 clinic invitation Edge tests, and Admin desktop/mobile browser coverage.

Local gate status on 2026-09-03:

- Lint and strict TypeScript passed across all packages.
- 17 application tests passed: 9 shared, 6 mobile, and 2 Admin.
- 16 Edge Function tests passed across both invitation functions.
- Five Playwright scenarios passed across desktop and mobile; one intentional desktop-only navigation skip.
- Secret scan, Impeccable anti-pattern audit, Admin production build, and Expo web/iOS/Android exports passed.
- PostgreSQL syntax parsing passed for the Phase 2 migration and pgTAP files.

External checks still required:

- Apply and run the migration and pgTAP suites on the linked Supabase project.
- Deploy and live-test the clinic invitation function.
- Run the Phase 2 Maestro flow on physical iOS and Android devices.

## Phase 3 — Marketplace, booking, and appointments

Expanded local slice implemented through 2026-09-04:

- Patient and family/dependant profile storage and mobile management.
- Foreground location permission with a no-location browsing fallback.
- Original dark map/list discovery surface with approved dentist/clinic/service search and deterministic ranking.
- Search, specialty, price, rating, gender, language, and open-now controls; server supports distance and radius filters.
- Trusted availability and service-derived duration, price, and deposit.
- Ten-minute booking holds, advisory slot serialization, hold and appointment exclusion constraints, idempotent mock confirmation, receipts, and availability reopening after valid cancellation.
- Appointment history/cancellation/rescheduling, participant-only patient-clinic chat, realtime chat, ten-second time-sensitive screen refresh, clinic-scoped guest walk-ins, and assigned verified-dentist completion.
- Single-use QR presentation plus camera/manual redemption, exclusion-protected 15-minute waitlist join/offer/accept flows, 24-hour deposit policy, 15-minute no-show rule, verified review submission, audit events, and privacy-safe notification outbox.
- Clinic operations workspace with explicit multi-clinic context, dentist/service selection, schedule state, no-show/completion actions, service-matched waitlist offers, walk-ins, check-in, and patient inbox.
- Six shared booking-rule tests, 64 structural pgTAP assertions, 61 behavioral pgTAP assertions, and three Phase 3 Maestro flows.
- English and Bangla patient/professional flows passed browser interaction at phone and tablet widths without horizontal overflow; the expanded operations split view and 730px wrapping repair were visually verified. All-platform production export passed on 2026-09-04.

Still required before Phase 3 closes:

- Apply and semantically verify the Phase 2 and Phase 3 migrations/RLS on PostgreSQL.
- Connect an actual map provider while preserving list access.
- Deploy notification processing and verify failure/retry behavior.
- Verify QR camera permission, scanning, and replay resistance on physical devices.
- Run concurrent database clients to prove exactly one booking winner.
- Run physical iOS/Android Maestro and English/Bangla visual/accessibility gates.

## Phase 4 — Dental EHR and clinical records

Implemented locally:

- Medical history, allergies, versioned bilingual consent, encounters, progress notes, diagnoses, adult/primary FDI odontograms, treatment plans, photographs/X-rays, structured prescriptions, and private prescription PDFs.
- Verified treating-dentist boundaries, finalized-only patient visibility, consent-gated cross-clinic reads, audited Super Admin snapshots, RPC-only mutations, immutable finalized records, and before/after versions.
- Responsive English/Bangla clinician and patient record surfaces, private signed media downloads, and atomic appointment completion on encounter finalization.
- 51 structural and 43 behavioral pgTAP assertions, 8 shared/mobile clinical tests, 6 prescription Edge Function tests, and a Phase 4 Maestro flow.

External checks still required:

- Apply the Phase 4 migration and execute both pgTAP suites semantically against PostgreSQL.
- Deploy and live-test the prescription document function and private Storage policies.
- Run physical iOS/Android Maestro, file upload/download, large-text, and reduced-motion checks.
- Complete practicing-dentist validation of clinical terminology, FDI entry, prescription output, and consent copy.

## Phases 5–6

Pending. Each later phase must add only its own schema and preserve all prior gates. See [CONTINUATION.md](CONTINUATION.md) for the full remaining plan and exact next actions.
