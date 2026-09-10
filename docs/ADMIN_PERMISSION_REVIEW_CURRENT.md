# Admin permissions review — 2026-09-10

Read-only source review of the current checkout. No application/schema changes, live account mutations, email delivery, or deployment verification were performed by this reviewer. Findings are code-backed, not proof of hosted behavior. Patient/dentist workflows are the priority; clinic business expansion is deferred.

## Highest-priority findings

1. **P1 — Emergency clinical/AI access accepts a NULL reason.** `supabase/migrations/202609040008_phase4_clinical_foundation.sql:583-597` and `202609040010_phase6_ai_hardening.sql:301-303` use `char_length(btrim(access_reason)) < 10`. SQL NULL makes the condition unknown rather than true, so a Super Admin can obtain snapshots with no substantive reason. Role checks still protect against ordinary users; this is a mandatory-audit-reason bypass, not an arbitrary-user clinical disclosure. Before exposing either snapshot in the console, add a versioned migration validating `char_length(btrim(coalesce(access_reason,'')))` against a bounded range, test NULL/blank/short/valid reasons and non-SA denial, and verify the deployed migration. Keep raw clinical/AI outputs out of general overview and analytics.

2. **P1 — Invitation onboarding lacks a reusable-password completion flow.** `supabase/functions/admin-invite/handler.ts:64-67` redirects recipients to `/auth/callback`; a repository search of `apps/admin` finds no callback/recovery/password-setup UI or `auth.updateUser` call. The Supabase client may consume invitation tokens automatically, but that alone is not a verified callback workflow and does not let a new recipient establish a reusable password in this console. Add explicit invite/password setup and expired-link/error states, then test a real delivered invitation through sign-out and normal password sign-in. Do not describe invitation creation alone as completed Admin onboarding.

3. **P1 — Verification evidence can belong to the previous applicant.** `apps/admin/src/components/VerificationWorkspace.tsx:49-55` keeps old `details` while loading a newly selected applicant; on failure it leaves the old evidence/history visible. The action controls at line 79 remain available during loading/error. The administrator can therefore approve applicant B while viewing applicant A's evidence. Clear or key details by applicant; fail closed on detail errors; block decisions until the selected applicant's details have loaded. `apps/admin/src/lib/phase2.ts:78-80` also discards signed-URL errors and renders unavailable live documents as “Preview fixture”; distinguish unavailable private evidence from intentional demo fixtures.

4. **P2 — Invitation handler trusts JSON runtime types.** `supabase/functions/admin-invite/handler.ts:41-51` types but does not validate JSON; `null`, numeric email, and non-string display name can throw at property access/trim. Decimal/string expiry is not rejected explicitly. Validate an object and bounded string/integer fields before use; return the stable INVALID_INPUT response. This is authenticated SA input handling, not an auth bypass.

## Invitation lifecycle: safe implementation contract

- Schema: `supabase/migrations/202609020001_phase1_foundation.sql:16,42-60`.
- Status values: `pending`, `accepted`, `revoked`, `expired`.
- Safe list columns: `id,email,display_name,status,invited_by,accepted_by,expires_at,delivery_confirmed_at,accepted_at,revoked_at,created_at`. Do not request/render `token_hash`, and never display a returned raw invitation token.
- `invitations_super_admin_read` is SA-only (`:365-367`). Authenticated clients have SELECT but no invitation UPDATE grant/policy (`:386-389`).
- No pending-admin-invitation revocation RPC exists in the reviewed migrations. Do not implement direct browser UPDATE or pretend that `revoke_operational_admin` cancels pending mail links. A new audited SA-only RPC and migration are needed for revocation; lock the row and only permit pending records so acceptance cannot race unnoticed.
- `create_admin_invitation` (`:275-314`) expires old pending records only when inviting the same email again. List UI should derive “expired” from `expires_at <= now()` even if stored status remains pending; retain stored status separately for mutations.
- Email delivery succeeds before `activate_admin_invitation` marks `delivery_confirmed_at`; verified-user trigger grants Admin only for unexpired pending delivered invitation (`:179-253`). Do not mark pending invitations as active administrators.
- `admin-invite` is the delivery path. Merely calling `create_admin_invitation` does not send an email and does not activate the invitation.
- Existing `revoke_operational_admin(target_user_id uuid, action_reason text)` removes only the accepted Admin role, preserves other roles, prevents removing Super Admin, and audits the reason (`202609060015_admin_workflows_refund_security.sql:61-71`).

## Actual permission matrix and safe reads

| Surface | Regular Admin | Super Admin | Existing boundary |
| --- | --- | --- | --- |
| Dentist applications, private verification evidence, decisions | Yes | Yes | `decide_dentist_application`, verification RLS/storage policies |
| Patient support cases and review moderation | Yes | Yes | `update_support_case` has expected-update conflict protection; `moderate_case_review` validates linked review |
| Profiles and role metadata | SELECT permitted | SELECT permitted | Foundation profiles/user_roles RLS permits `is_admin()` |
| Enumerate roles via `admin_user_roles()` | No | Yes | Explicit SA check in RPC |
| Audit operational metadata | SELECT permitted | SELECT permitted | `audit_admin_read` permits `is_admin()` |
| Invite/remove administrators | No | Yes | Edge invite plus role-removal RPC; no pending revoke RPC |
| Feature flags/usage-limit reads | Yes, also other authenticated users | Yes | Public operational settings, not secrets |
| Feature flags/usage-limit writes | No | Yes | `set_feature_flag`, `set_platform_usage_limit` |
| AI provider masked settings / daily usage | No | Yes | SA-only RLS |
| Raw clinical/AI emergency snapshots | No | Yes, reason required | Snapshot RPCs; repair NULL reason first |
| AI provider plaintext secrets | No | No client readback | Service-only secret RPC, write-only rotation endpoint |

Source: foundation migration `:350-384`; admin workflow migration `:25-71`; AI migration `:281-287,301-335`.

The existing console intentionally disables Users/Audit for regular Admin, even though server metadata reads permit them. This is a product/UI choice, not server-enforced prohibition. Do not claim those data are SA-exclusive. Conversely, simply enabling the current `PlatformWorkspace` for regular Admin is broken: it always queries SA-only `admin_user_roles()` and treats any concurrent query failure as failure of every panel (`PlatformWorkspace.tsx:38-65`). Use capability-scoped loaders if widening regular Admin metadata access.

## Options safe to expose now

- Real role-aware overview counts and links for dentist verification, open/investigating support, and administrator invitations. Count both open and investigating cases; do not count dismissed cases as open. Handle each query error instead of falsely displaying zero/healthy.
- SA invitation history with delivered/pending/expired distinctions, masked operational context, refresh and search. No invented revoke action until its server contract exists.
- SA role metadata and existing accepted-Admin removal with explicit reason and confirmation.
- SA audited feature flags, daily AI limits, provider/model selection and masked key status. Separate provider availability from successful real provider verification.
- Admin/Super Admin verification and support queues with private evidence, attributable decisions, and safe error handling.

Avoid a generic `app_configuration` editor: foundation `:377-403` permits direct SA changes to `value,is_public,description`, but no audited mutation RPC/validation contract exists. Exposing `is_public` could publish private operational configuration. Use narrow validated audited commands when this capability is needed.

## Verification gaps to retain in handoff

This review did not establish real Super Admin/Admin accounts, invitation delivery/acceptance, hosted current-migration status, mobile physical-device acceptance, or external AI/payment provider success. Keep demo actions explicitly non-persistent and do not show “Live”/“verified session” for fictional preview data. Source/unit-test success does not close these live gates.
