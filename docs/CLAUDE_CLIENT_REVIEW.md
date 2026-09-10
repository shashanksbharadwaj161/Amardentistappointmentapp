# Reconciled client-demo review — September 10, 2026

This is the local lead's synthesis of the Claude Code browser review and its subsequent corrections, not an automatically synchronized cloud file. Claude reviewed `79bc55d` in an isolated cloud checkout. It did not change application code, commit or push. Its temporary report was removed in the cloud; the corrected conclusions remain in that chat.

## Verdict

**Guided UI walkthrough: possible with disclosed limitations. Full client acceptance: not ready.**

Claude reported PASS_WITH_NOTES for a narrated demonstration, not production acceptance. Its method was static code inspection; it did not run tests, builds, live account journeys or physical-device checks. Local verification is documented separately in `CHECKPOINT_2026-09-10.md`. No current whole-product completion percentage is established.

## Confirmed gaps

| Area | Evidence and impact |
| --- | --- |
| Patient support intake | There is no patient support route or mobile call to `open_support_case`. The authenticated RPC exists in `supabase/migrations/202609060015_admin_workflows_refund_security.sql:3`. Patients cannot yet originate an in-app case for the Admin queue. |
| Admin role governance | `apps/admin/src/components/PlatformWorkspace.tsx:73` renders a read-only users table. Invitation UI exists, but role-listing/revocation controls are not wired to the existing governance RPCs. |
| Clinic back office | `apps/mobile/app/professional/business.tsx` provides financial totals, expense entry and inventory-item creation. Its laboratory tab is a list. Stock receipt/consumption, lab workflow, purchase orders and complete invoice/payout journeys still need UI work. |
| Live acceptance | Mock deposits and canned AI previews are not real integrations. Authenticated multi-role journeys, provider configuration, private-file permissions, cross-device realtime and physical-device acceptance remain unverified. |

The lead checked the first three findings against the current local source. Treat scope gaps as unfinished work, not necessarily defects in the functionality already delivered.

## Corrections to the original Claude report

- Retracted: claims that payment/AI functions were undeployed. All ten function names exist in the hosted project. The latest clinic-invite and payment-checkout wrappers were deployed in this pass. Deployment presence and preflight success do not prove authenticated delivery or provider readiness.
- Downgraded: preview confirmations are not evidence of a hidden real payment. The mobile shell persistently labels preview data as not saved; booking also states no appointment was saved and no payment taken. Non-persistence remains a limitation for an end-to-end demonstration.
- Qualified: clinical finalization, QR check-in and walk-in handlers are wired in code, not proven to persist successfully by this static review.
- Retracted: the assertion that no live Super Admin account exists. Account existence was not queried. Activation was deferred and live access remains unverified.
- Narrowed: the next implementation batch is patient support intake alone, not five large workstreams at once.

## Next bounded implementation batch — not implemented by this review

1. Add a bilingual patient support screen and typed helper for `open_support_case`, with category/summary validation, busy/error/success states and explicit non-persistent preview behavior.
2. Add an accessible route through the existing patient support/navigation group and a contextual entry from records. Update route matching and translation tests together.
3. Test that real success comes only from a successful authenticated RPC; refresh case history after submission if implemented; check desktop/compact English/Bangla layouts.
4. Demonstrate patient submission becoming visible in the authorized Admin case queue using test accounts, without exposing clinical details to ordinary Admins.

Likely write set: new `apps/mobile/app/patient/support.tsx`, a new support helper/test under `apps/mobile/src/lib`, `navigation.ts`, `navigation-messages.ts`, their tests, and a scoped records entry. Re-check the existing database contract and permissions before implementation. Review reporting, role controls and business operations are separate later batches. No schema change or privilege expansion is implied by this review.

## Demo cautions

- Use fictional data for a narrated preview. Do not represent mock bookings, AI drafts or preview role identities as real transactions or permissions.
- The admin preview still has static overview copy such as “Live” and “session verified.” Add a persistent preview banner and qualify that copy before an unattended client demonstration. This was observed during the lead's final preview check, not covered by Claude's original report.
- Keep real credentials and real records out of demo screenshots and walkthroughs.
