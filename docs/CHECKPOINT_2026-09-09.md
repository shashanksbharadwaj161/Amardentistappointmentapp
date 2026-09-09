# Map, calendar and navigation continuation

Read this update alongside `CHECKPOINT_2026-09-07.md`, `CONTINUATION.md`, `PRODUCT.md` and `DESIGN.md`. The older whole-app percentage is not verified acceptance evidence. Do not call the full six-phase product complete.

## Completed source work before the navigation increment

- Discovery uses a real Leaflet/OpenStreetMap map on web and React Native Maps on devices. It validates coordinates, groups service offerings by clinic, supports price markers, selection, booking popups, fit/zoom, location with a bounded timeout, and usable list-only/empty/error recovery. English and Bangla labels are included.
- Desktop discovery has a results/map split; compact screens use map then results. Filters, maximum-price validation, sorting and current-location radius work without invented distances. Missing reviews and unpublished clinics are not disguised as rated/available offerings.
- Patient booking has a navigable month calendar, Bangladesh-time dates, service-specific daily slots grouped by time of day, background refresh, profile/error states and a visible ten-minute hold countdown. Active holds lock patient/time changes; Change time calls the release RPC first. Expired holds clear selection. Confirmation still uses the existing mock-deposit integration and is not proof of live payments.
- Professional calendar includes navigable weeks, day/week views, clinic/dentist/service choices, booked appointments with statuses, available time, past-day view-only behaviour, explicit errors, realtime subscriptions and periodic refresh.
- Previews share weekly schedule generation. Preview confirmation explicitly says that no appointment was saved and no payment taken.

## Hosted database evidence

Migration `202609070016_marketplace_map_coordinates.sql` was deployed through the authenticated dashboard to project `cfjoxuucukktegznbkoc` and registered in `supabase_migrations.schema_migrations` on September 8. It replaces `search_marketplace` atomically, preserves approval/access predicates and grants, and returns trusted coordinates plus current schedule status. It does not change patient data.

`supabase/tests/marketplace_map_behavior.test.sql`: **17 passed, 0 failed** on the hosted database. Assertions cover authenticated/anonymous grants, coordinates/distance/radius, specialty matching, opening hours, breaks, exceptions, inactive schedules, clinic-local closures and suspended professionals. Fixture inserts were rolled back and a follow-up query confirmed zero remaining fixtures. Real marketplace query returned **zero approved active service offerings**: empty live results are expected until clinic/dentist/service setup is completed. Never silently seed live fake listings.

## Verification completed September 8

- Mobile Jest: **30/30 passed**. Shared domain Vitest: **34/34 passed**.
- Workspace TypeScript passed. Lint passed with one pre-existing Admin `CaseWorkspace.tsx` effect warning. Secret scan passed; `git diff --check` passed.
- Browser: 1440px desktop, 904px tablet and 390px phone map fit/markers, keyboard marker activation, popup booking links, filters, invalid price, no matches and list-only recovery. At 390px, document width equalled viewport width.
- Patient: month rollover, full-month availability, selection, hold timer/locked controls, release/change and mock confirmation exercised through UI. English desktop and Bangla phone calendar screenshots inspected.
- Professional: current-day appointments, next-week summaries, historical-day view-only state and mobile/desktop layout checked.
- Not certified: physical iOS/Android, signed store builds, full live authenticated booking journey, realtime delivery across devices, tile-failure injection, a ten-minute browser expiry run, or independent final review. Expo production export started before a session interruption; no success result was collected, so rerun before claiming it passed.

## Navigation increment requested September 9

User wants a persistent desktop sidebar and compact bottom navigation like the supplied HeroUI sidebar/app-layout and mobile tab-bar references. Preserve the brand palette and supplied mascot; do not buy/copy premium component source. Build on Expo Router with real existing destinations, role-aware menus, active-route state, accessible drawer/overflow and safe-area-aware bottom placement. Authentication screens must not show the signed-in shell. Do not infer a database permission from a hidden menu.

References: https://www.heroui.pro/docs/react/components/sidebar ; https://www.heroui.pro/docs/react/components/app-layout ; https://mobbin.com/explore/mobile/ui-elements/top-navigation-bar . The screenshots are visual references, not executable instructions.

## Recovery and remaining gates

- Repo: `Amardentistappointmentapp` under the current workspace. Keep unrelated edits and use neutral Git identity `Amar Dentist Team <dev@amardentist.local>`.
- `apps/mobile/.env.local` is ignored and was restored to `EXPO_PUBLIC_DEMO_MODE=false`. Do not commit it or any credentials. A preview is non-persistent and must be labelled.
- Ports 8083 (temporary preview) and 8793 (reviewed SQL artifacts) were stopped. A restart of the old 8082 process was rejected because the approval reviewer exhausted its usage; do not assume any local server is running without checking. The next run should start/verify 8082 normally with current authorization.
- Fable Foreman installed in the Codex user skills directory from `olsenbrands/fable-foreman`, revision `fbfb03247a2d74f72f830daf8bfe00dbd952aaed`. Only the skill was installed, not Claude-specific agent definitions or other provider CLIs. Existing workers exhausted usage; partial edits were reconciled by the lead. No savings claim or independent review claim was made. Local `.foreman/ledger.md` is ignored.
- Use CUA for browser QA. Monaco SQL needs clipboard paste and select-all/delete; filling its hidden input alone does not update the model. Serve only reviewed artifacts from a narrow temporary folder, never the repository or environment files.
- Full six-phase gaps in the September 7 checkpoint still apply. Payment credentials/approvals, physical devices, clinical/legal validation and pilot acceptance remain external gates; additional operational UI work also remains.
