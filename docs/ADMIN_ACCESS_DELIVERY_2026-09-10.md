# Admin access and preview correctness

## Delivered

- Users now displays assigned roles separately from active mode, using the existing Super Admin-only `admin_user_roles` RPC.
- Ordinary Admin access can be removed from Users with an explicit confirmation and a required, trimmed 5–500 character reason. The existing `revoke_operational_admin` RPC enforces Super Admin authorization, protects Super Admin targets, and records the audit event. Other roles are preserved.
- Admin creation still uses the invitation-only flow. No public role-grant form or password bypass was introduced.
- Failed invitation requests now release the busy state, preserve the form, and avoid claiming success. Duplicate submissions are guarded.
- Preview invitations do not call the live callback. Preview case decisions, review moderation, approvals, and role removals explicitly say that no real permissions or audit records changed.
- The preview console has a persistent notice that its sample actions are not real account changes, messages, or payments.
- Accessible form primitives follow the existing component system. Generated registry aliases were corrected to local utilities and existing Radix primitives; no new runtime dependency remains.

## Verified in this pass

- Mobile: 56 tests passed across 11 suites, including the newly added support helper and screen tests.
- Admin: 9 tests passed across two suites, including role-removal success/denial, preview removal, role display, and preview action wording.
- Shared domain: 34 tests passed. Workspace-wide type checking passed. A registry installation temporarily disrupted dependency links; a frozen-lockfile install restored them before these passing checks. The committed dependency manifest and lockfile are unchanged.
- Edge Functions: 63 tests passed. This gives 162 passing tests in this pass across mobile, Admin, domain, and Edge Functions; mocked provider tests are not real-provider certification. Secret scan and static UI audit passed.
- Admin production build passed after correcting test typing. The existing large-bundle advisory remains.
- Visible browser on localhost:4175: entered preview, opened Users, confirmed roles separate from mode, opened removal dialog, entered a fictional reason, removed the sample Admin role, and confirmed the patient role remained with a preview-only result.
- Mobile server on localhost:8082 remained running; its visible tab was signed out.

## Open acceptance gates

These checks do not prove live patient/Admin acceptance or deployed database policy behavior. Existing pgTAP fixtures cover patient denial, Super Admin protection, and ordinary Admin revocation, but were not rerun against the hosted database in this pass. No real administrator was invited or revoked.

The first two code batches are delivered, not the entire app. Clinic inventory/labs/finance, remaining clinical editing flows, contextual report references, full signed-in role journeys, actual providers, physical devices, and pilot acceptance still need completion and verification. Continue sequentially from clinic operations. Refer to `SUPPORT_DELIVERY_2026-09-10.md` for the patient support manual acceptance flow.

## Next bounded implementation

`apps/mobile/app/professional/business.tsx` currently supports only expense entry, inventory-item creation, and read-only finance/stock/lab summaries. Its `phase5.ts` helpers already expose `postStockMovement` and `createLabCase`, but there is no corresponding usable form. Start with item lot receipt and lot-specific consumption: `stockMovementSchema` requires a real lot UUID, so do not substitute arbitrary item IDs or allow a null lot. Existing server RPCs include `create_inventory_lot` and `post_stock_movement`. Inspect their latest migration definitions and RLS before wiring the forms; keep clinic-scoped item/lot selection, server-side nonnegative stock protection, duplicate-submit protection, and explicit non-persistent preview results. Then address lab vendors/cases/status workflow, invoices, and remaining finance operations.
