# Build progress

Updated: 2026-09-03

Progress is gate-weighted rather than based on file count. A phase earns its full weight only after its required database, security, device, visual, and end-to-end gates pass.

| Phase | Product weight | Phase completion | Earned overall |
| --- | ---: | ---: | ---: |
| 1. Foundation, authentication, and UI | 15% | 99% | 14.85% |
| 2. Clinics, verification, and scheduling | 16% | 75% | 12.00% |
| 3. Marketplace, booking, and appointments | 20% | 25% | 5.00% |
| 4. Dental EHR and clinical records | 18% | 0% | 0% |
| 5. Payments, finance, inventory, labs, and subscriptions | 18% | 0% | 0% |
| 6. AI, administration, and production hardening | 13% | 0% | 0% |
| **Whole app** | **100%** |  | **31.85%** |

## Current gate

Phase 1 code, design, localization, tests, Edge Function fixtures, production exports, live schema deployment, live RLS enablement, live structural and behavioral pgTAP suites, migration-history registration, authentication URL configuration, hosted invitation-function deployment, and live unauthenticated rejection are green. Super Admin account activation is intentionally deferred to Phase 6 production hardening. A Maestro device flow is ready. Phase 1 still requires:

- Verify live password recovery and administrator invitation delivery.
- Complete the physical iOS and Android Maestro run.

Phase 2 has a complete local implementation for clinic/staff membership, clinic and dentist verification, private evidence, services, schedules, breaks, exceptions, day/week availability, and Admin review. The 2026-09-03 local gate passed lint, strict type checking, 17 application tests, 16 Edge Function tests, secret scanning, UI audit, all-platform Expo export, Admin production build, and five desktop/mobile Playwright flows. Phase 2 remains at 75% until:

- Apply `202609030002_phase2_clinics_scheduling.sql` to the linked Supabase project.
- Execute both Phase 2 pgTAP suites against live PostgreSQL and resolve any semantic or RLS failures.
- Deploy and verify the `clinic-invite` Edge Function.
- Complete physical iOS and Android Maestro verification, including English/Bangla, large text, and reduced motion.

Phase 3 is 25% complete. The first local vertical slice now includes patient/family profiles, foreground location with a privacy-preserving fallback, dark map/list discovery, approved marketplace search, deterministic ranking, trusted availability, ten-minute holds, mock deposit confirmation, receipts, QR/check-in, waitlist, cancellation/no-show/review foundations, a notification outbox, and the PostgreSQL overlap constraints. English booking and Bangla discovery passed live browser interaction. The Phase 3 migration, 49 structural pgTAP assertions, and 30 booking-behavior assertions parse as PostgreSQL; 5 shared Phase 3 unit tests pass. It remains incomplete until the migration and tests run semantically, advanced filters and actual map tiles are connected, and the remaining appointment/realtime/messaging/device flows are implemented and verified.
