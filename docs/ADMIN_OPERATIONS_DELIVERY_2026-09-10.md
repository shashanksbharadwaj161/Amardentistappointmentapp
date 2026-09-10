# Admin operations delivery — 2026-09-10

## Final stop checkpoint

User requested a quick finish and stop. No further Claude tasks are scheduled; Claude's final Admin source review completed, and all local workers finished.

- Final local verification: **75 mobile + 70 Admin + 34 domain tests passed**; 63 Edge Function tests passed. Admin desktop/mobile E2E: **13 passed, one intentional desktop skip of a mobile-only case**. Typecheck and lint exit 0; the documented warnings remain. Secret scan passed for 325 files; static UI audit returned no findings.
- The two independently confirmed clinical High findings were repaired and independently re-reviewed PASS: unresolved conflicts persist until explicit choice; finalization compares the exact reviewed note snapshot under a database row lock and saves/finalizes in one transaction. No claim of whole-record optimistic versioning is made.
- Migration **018 is deployed**. Hosted verification confirmed exact recorded source, authenticated guarded-RPC access, and denial of anonymous and legacy authenticated direct-finalization access. Its **33 behavioral pgTAP assertions have NOT yet run against the hosted database**; local Docker/Postgres remains unavailable. This gate stays open.
- Migration 017's browser-equivalent 32 assertions passed, with rollback and exact-source tracking verified.
- Expo web/iOS/Android export passed before the final atomic-client repair. The final repair passed typecheck/tests but needs a fresh export/device run; do not present the earlier export as evidence for the last client revision.
- Live role acceptance remains blocked: both requested owner accounts are unverified, and the last role census contained only three patients. No email was auto-confirmed and no hardcoded credential was introduced. Live Admin/dentist/patient journeys, provider integration, full DB/RLS suite, physical devices, backup/restore and pilot acceptance remain open. Allergy/medication context in the prescribing screen also remains a follow-up from Claude's read-only review.
- Work is organized in logical commits on `feat/admin-operations-console`, tracked by draft PR #1. Keep the PR draft until remaining acceptance gates are explicitly resolved; do not equate push with production readiness.

The sections below retain earlier checkpoint evidence and are superseded by this final status where they differ.

## Latest integration update (supersedes earlier checkpoint status below)

- Claude commits `44ac6e7` and `12b9cfd` are integrated as `80018fe` and `3be6897`: explicit prescription-draft finalization, encounter-query refresh, bilingual per-field note conflict resolution, and failed-refresh finalization protection. Independent final review is in progress.
- Integrated mobile tests: 67 passed. Shared-domain tests: 34 passed. Admin now includes two additional finance-preview tests; use the final test report for its total.
- Hosted browser-equivalent pgTAP coverage was expanded to **32 assertions, 32 passed, zero failures**, including patient denial, returned payload and audit checks. This was a generated SQL-editor equivalent, not a CLI execution of the literal test file or the full database suite.
- A separate read confirmed zero temporary test accounts remain and the recorded migration source matches the applied source.
- Code commits are grouped on `feat/admin-operations-console`; final publication and remaining account/provider/device gates are not implied by this update.

## Current priority

The user now prioritizes **individual dentists and patients**, with a capable Super Admin and operational Admin console. Clinic business management, inventory, labs, and business finance are deferred to the end and may be removed later. Preserve the internal clinic relationships that existing booking and clinical permissions depend on; do not delete or redesign those relationships as a side effect.

This checkpoint records implemented source and bounded verification. It is not a declaration that the whole app, every role journey, or production launch is complete. Do not revive historical whole-app percentages.

## Implemented in this worktree

- Admin invitation/recovery account setup and password completion, including authentication state handling and dedicated tests. Real delivered-email acceptance through subsequent password sign-in still needs verification.
- A role-aware action centre for dentist verification, open support, and unexpired pending administrator invitations.
- Super Admin invitation history, notification-delivery metadata, and bounded AI usage/cost views. Reads use explicit safe columns, not clinical payloads, recipient contents, or secrets. Pending invitation cancellation is not implemented; do not confuse accepted-Admin role removal with invitation revocation.
- Separate AI provider, feature-flag, and usage-limit controls with loading/error handling, validated values, and explicit preview behavior. Provider credentials remain write-only; configuration does not prove an external provider request succeeds.
- Verification repair: selected applicants own their evidence state; stale/failed evidence cannot support a decision; private signed-URL failures are errors; save actions prevent duplicate decisions and applicant switching.
- Migration `202609100017_emergency_access_reason_hardening.sql` repairs NULL/blank/short/oversized emergency-read reasons. Both existing snapshot RPCs retain Super Admin checks, payloads, grants, and audited reads. Normalized reasons must contain 10–500 characters; spaces, tabs, line breaks, vertical tabs, and form feeds are trimmed. No new raw clinical/AI browser surface was introduced.

See `docs/ADMIN_PERMISSION_REVIEW_CURRENT.md` for the original source findings and permission matrix. Some findings have since been repaired above; do not treat that earlier review as proof those repairs remain absent.

## Verification evidence

The coordinating implementation task reported the following results for this increment:

| Check | Result and boundary |
| --- | --- |
| Workspace tests | 67 Admin + 56 mobile + 34 shared-domain tests passed: 157 total |
| Edge Function tests | 63 passed; combined automated total 220 |
| Type checks / Admin build / lint | Exit 0; two new Fast Refresh export warnings in OperationalOverview, existing CaseWorkspace warning, and bundle-size advisory remain |
| Secret scan | 316 files scanned; passed |
| UI static audit | No reported findings (`[]`); not equivalent to full visual/device acceptance |
| Migration 017 | Deployed through the visible hosted SQL editor with exact migration-source tracking; separate static reviewer approved |
| Hosted security smoke | Separate rollback-only test: 20 assertions, 20 passed, 0 failed; anonymous/ordinary-Admin denial and SA reason-validation boundaries covered |
| Full new pgTAP file | 32 assertions authored; **the full file was not executed as part of the 20-assertion smoke** |
| Full database suite | Not rerun; local Postgres/Docker was unavailable |

The hosted smoke tested NULL, spaces, vertical-tab/form-feed, 9- and 501-character rejection, and valid 10-/500-character boundaries. It does not replace the complete 32-assertion test file, full RLS regression suite, real role journeys, or external integration checks.

## Access and integration state

- The latest hosted role inspection found only three patient-role rows. No live Admin/Super Admin journey has been established from that observation.
- Both requested owner accounts exist, but neither had a verified email at the inspection point. The user was asked to complete verification asynchronously. Recheck current state before deciding the next activation step; do not assume the pending email action completed.
- Do not copy account emails, passwords, tokens, or secrets into this handoff. Do not auto-confirm emails, hardcode passwords, or broaden grants to make a demo appear complete.
- Claude's `44ac6e7` branch was pushed but **not integrated** at this checkpoint. A follow-up conflict-resolution pass was running. Inspect that result and the current diff before merging; do not blindly cherry-pick over local fixes or report the branch as integrated.
- Application changes in this checkpoint may still be uncommitted. Inspect the actual worktree and Git history before building on or publishing them; this document does not claim a commit/push completed.

## Next gates, in order

1. Collect/reconcile Claude's follow-up without losing local permission, evidence, or preview fixes; rerun affected tests after integration.
2. Finish visible-browser QA of overview, invitations, provider/flags/limits, verification loading/failure/retry, password setup, and narrow/wide navigation. Preserve the established pearl/navy/mint design and honest preview labels.
3. Recheck email verification, complete the authorized secure owner-access setup, and verify actual Super Admin and ordinary Admin boundaries. Test a delivered invitation, setup, sign-out, subsequent sign-in, accepted-Admin removal, support decisions, and dentist verification end to end.
4. Run the complete new 32-assertion pgTAP file and full database/RLS regression suite. Keep migration 017 immutable now that it is deployed; any further repair requires a later versioned migration.
5. Complete patient/dentist booking, calendar, messaging, clinical-record/prescription, consent, and AI-review role journeys. Do not expose draft/raw AI records to patients or private clinical information to operational Admins.
6. Verify real AI/notification/subscription providers when configured. Payment-provider integration remains deferred per user instruction; mock payment success is not real payment acceptance.
7. Complete physical iOS/Android testing, backup/restore rehearsal, privacy/clinical validation, and pilot acceptance before launch. Clinic business work stays last.

Read this with `docs/CONTINUATION.md`, `PRODUCT.md`, and `DESIGN.md`. Source test success, hosted smoke success, and production/client acceptance are separate claims.

## Verified browser regression follow-up

- Full `pnpm verify:e2e` passed: **13 passed, 1 pre-existing platform skip** (the mobile-navigation-only test is intentionally not run in the desktop project), 36.0 seconds. No failing tests were skipped or weakened.
- Updated obsolete case/verification assertions to require the exact honest preview action confirmation, distinct from the global preview banner.
- Added desktop and Pixel 7 browser coverage for ordinary Admin restrictions, separate AI settings destinations, negative and inverted quotas, temporary feature/limit changes, and disabled preview credential entry. Provider screens pass horizontal-overflow checks.
- Corrected finance preview copy: sample commission changes and plans no longer claim persistence or audit events. The existing finance business behavior is otherwise unchanged. Two focused finance tests and Admin typecheck passed.
- The run regenerated ten existing `docs/verification/admin-*.png` screenshots and added desktop/mobile `admin-ai-provider-*.png` screenshots. These show synthetic preview flows, not live account or provider acceptance.
