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

## Phases 3–6

Pending. Each later phase must add only its own schema and preserve all prior gates. See [CONTINUATION.md](CONTINUATION.md) for the full remaining plan and exact next actions.
