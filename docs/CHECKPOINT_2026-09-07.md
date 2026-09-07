# Verified checkpoint and remaining implementation

This update supersedes completion claims in older reports. Read `CONTINUATION.md`, `PRODUCT.md`, and `DESIGN.md` for the full scope, rules, brand assets, links, and design system. Do not restart or overwrite existing work.

## Completion correction

The old 87.84% figure was an engineering estimate, not a measured acceptance result. A deeper audit found missing operational interfaces and preview paths that return success without persisting changes. Do not describe the app as complete or client-acceptance-ready based on that figure. A reliable replacement percentage requires mapping every approved requirement to an implemented, deployed, tested user journey. The six-phase scope remains unchanged.

## This checkpoint

- Added migration `202609060015_admin_workflows_refund_security.sql`; applied successfully to project `cfjoxuucukktegznbkoc`, then separately registered in migration history.
- Added authenticated support-case creation, Admin assignment/resolution with stale-edit protection, reason-required review moderation, Super Admin role enumeration and ordinary-Admin revocation (Super Admin protected).
- Admin Cases now supports selecting, assigning, resolving, dismissing, hiding/restoring a reported review, and requesting a provider refund. Database authorization is independent of UI visibility.
- Refund authorization now precedes idempotency lookup. Existing keys cannot change payment, amount, or requesting user. Pending refunds reserve the remaining refundable balance.
- Refund execution uses service-only database context for provider, payment reference, amount, and idempotency key. Forged browser provider details are ignored. A completed replay does not call the provider again; an uncertain result is not reported as success.
- Added shared browser preflight/error handling to seven authenticated Edge Function entrypoints. No cookies or credentialed CORS are used; bearer authentication still applies.
- `payment-refund` update deployed and live OPTIONS verified HTTP 204 with the expected allow headers. Other six browser-endpoint updates remain to deploy at the time of this checkpoint; update this document after verification.
- Unconfigured subscription purchases now fail instead of reporting active membership.
- AI encounter-loading errors are caught in the generation flow.
- Dental chart now offers permanent/primary FDI selection and all seven tooth surfaces, with English/Bangla labels. Server validation is preserved.

## Verification evidence

- Hosted support/Admin suite: **16/16** passed, aggregated in the SQL Editor in one result (not just the last assertion).
- Hosted finance behavior suite: **29/29** passed, including refund authorization, replay, reserved balance, stock and reconciliation.
- Tests use synthetic `example.test` accounts inside rolled-back transactions; no fixture users remain.
- Edge handler tests: **63/63** passed.
- Local shared/mobile/admin tests: **31 + 13 + 3** passed.
- Lint, strict TypeScript, secret scan, repository UI audit, Admin production build, and Expo web/iOS/Android exports passed.
- Admin desktop/mobile browser journeys: **9 passed**, one intentional desktop skip for a mobile-only navigation case.
- New screenshots: `docs/verification/admin-cases-desktop-chromium.png` and `admin-cases-mobile-chromium.png`. Visual inspection identified and removed excess queue whitespace and stale inline validation copy. Screenshots were regenerated and inspected; all 9 browser tests passed again after these fixes.
- The previous 452 hosted assertions are historical evidence, not a full rerun during this checkpoint. Local `verify:db` could not run because Docker is unavailable. A JavaScript bundle export is not a signed native build or physical-device test.

## Next implementation work (not merely missing credentials)

1. Deploy remaining CORS-wrapped functions: `admin-invite`, `clinic-invite`, `generate-prescription`, `payment-checkout`, `ai-task`, `ai-key-rotate`. Smoke-test OPTIONS and unauthorized POST. Do not infer functional success from gateway 401 alone.
2. Connect patient support-case creation/history UI to `open_support_case`. The RPC exists; no patient support screen exists yet. Add review-report entry points and live role-specific UI integration tests.
3. Connect `admin_user_roles` and `revoke_operational_admin` to the Users workspace; currently only server operations exist. Add appropriate confirmation and reason controls. Never remove Super Admin through this path.
4. Complete finance/inventory/lab operational interfaces. `professional/business.tsx` currently exposes finance totals, expense creation, inventory item creation and read-only lab lists. Lot receipts/consumption, suppliers/purchase orders, invoices/discounts/balances, lab creation/transitions/attachments, payout operations and reports need usable tested flows even though substantial schema/RPCs exist.
5. Expand clinical multi-item prescription editing, treatment progress/amendment controls and visual odontogram verification. Test the new primary/permanent chart in both locales on small screens. Do not treat existing tables/types as proof of complete clinical UX.
6. Audit every `if (!supabase || previewEnabled)` path. Several saves currently return without persisting demo state. Either implement coherent session-local demo storage or explicitly mark those demonstrations as non-persistent; never tell the client a save persisted if it did not.
7. Run authenticated hosted account journeys and private file upload/download tests. The current browser tests are preview-mode tests, not end-to-end Supabase authentication tests.
8. Audit the full original six-phase checklist, including discovery map provider, waitlist/QR/realtime, clinical history sharing and consent revocation, notification delivery/retries, AI prompt-injection and field review, and Super Admin exceptional access auditing.

## External acceptance gates

Super Admin activation remains deferred by the user. Never hardcode passwords. Payment credentials/provider approval, AI key entry, RevenueCat/store accounts, notification credentials, physical iOS/Android/Maestro, signed store builds, legal/privacy review, practicing-dentist validation, backup/restore drill and the closed-clinic pilot are still required. These gates cannot be certified using mocks.

## Deployment technique and recovery

Use normal CLI deployment when securely authenticated. Browser deployment is available through the signed-in Supabase dashboard. Build a single-file bundle with `pnpm exec deno bundle --platform deno --packages external --external 'npm:*' --output <temporary-file> supabase/functions/<name>/index.ts`. Serve only reviewed SQL/bundles from a narrow temporary directory; never serve the repository or environment files.

In the dashboard editor, click Editor content, select all, delete, then fill the complete bundle. Filling the Monaco input alone can leave old source behind. Publish, verify success, then check the public endpoint. Do not read browser tokens or use undocumented APIs. Keep all schema changes in migrations; migration history registration is a separate deployment step, never self-inserted by migration SQL.

At the checkpoint, temporary reviewed artifacts were in `/tmp/amar-deploy.yU4ODC`, served on loopback port 8793. This directory is disposable and may not survive a restart. Rebuild from repository source if absent. No secret material belongs there.

Before pushing: rerun relevant tests, `git diff --check`, secret scan, inspect staged files; use the repository's neutral Builder identity and verify the remote commit. Preserve user changes and all corrective migrations.
