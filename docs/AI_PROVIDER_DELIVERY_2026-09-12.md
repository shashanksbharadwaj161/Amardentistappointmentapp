# AI provider delivery — 2026-09-12

## Evidence boundary

This is a scoped dual-provider delivery, not whole-app production acceptance. Feature source is committed and pushed as `0117623028e1a8d04da402a82859919aa094dbc8` on `feat/admin-operations-console`. PR #1 remains the review destination; do not infer that `main` was merged.

## Implemented

- Super Admin provider selector: OpenAI/GPT and Anthropic/Claude, separate masked key statuses and encrypted Vault records.
- Model suggestions plus custom model IDs; model-only changes do not require re-entering the saved key.
- Explicit active-provider selection. Saving/testing a key never silently switches providers.
- Protected `ai-provider-test` endpoint tests the saved model/key with a fixed synthetic prompt, rate limited to six requests per actor per hour. No clinical information is submitted. Audit events record started/passed/failed without keys or raw provider errors. An audit-start failure blocks the paid request; an audit-completion failure is not reported as confirmed success.
- Dynamic Claude task routing with local schema validation, JPEG/PNG handling, output limits, refusal/truncation rejection, and no silent provider fallback. Claude requires an exact model ID: aliases resolving to another ID fail closed.
- Existing patient-output filtering, dentist field review, and atomic clinical finalization remain in place.
- Task-bound credential resolution preserves the provider/model captured when the request was prepared. An intervening model change fails closed instead of silently executing another model.
- UI rejects a key-rotation response whose provider/model differs from the submitted target. Preview never accepts real credentials.

## Verified this run

| Check | Result |
| --- | --- |
| Hosted migration 019 dry run | Succeeded and rolled back |
| Hosted dual-provider pgTAP-equivalent run | All 36 original assertions passed; zero failures; rollback-only fixtures |
| Hosted migration 019 installation | Succeeded; recorded source MD5 matches local `e18b91ccafe265b5742b8ad45220c310` |
| Fixture cleanup | All three synthetic auth users absent after rollback |
| Edge Function suite | 114 passed |
| Admin unit suite | 82 passed, including 25 AI configuration checks |
| Mobile unit suite | 75 passed |
| Shared-domain suite | 34 passed |
| Admin browser suite | 13 passed; one intentional desktop skip of a mobile-only case |
| Workspace typecheck | Passed |
| Workspace lint | Passed with existing non-blocking Admin warnings |
| Secret scan | Passed, 333 files |
| Admin preview build | Passed; existing large-bundle warning remains |
| Expo web/iOS/Android export | Passed; this is not a signed physical-device acceptance test |

The hosted test wrapper collected the repository's 36 assertions into a temporary result table to avoid mistaking a partially visible grid for a complete pass. It returned `assertions=36`, `failures=0`, `failure_details=none`. All temporary fixture/settings/Vault changes were rolled back before the actual migration was committed.

Migration 019 is now immutable. Future database fixes require a later migration.

Hosted `ai-key-rotate`, `ai-task`, and `ai-provider-test` were deployed through the dashboard using immutable GitHub imports pinned to `0117623028e1a8d04da402a82859919aa094dbc8`. The deployed editor contents were checked. Fresh requests to each returned HTTP 204 for OPTIONS and HTTP 401 for unauthenticated POST. These six smoke checks establish preflight availability and anonymous rejection, not authenticated authorization or successful external provider execution. The new function's legacy JWT verification setting remains enabled; real-session compatibility is still unverified.

## Live access and provider acceptance still open

- No real Anthropic or OpenAI key was supplied, stored, or used in this run. A saved key and a working endpoint do not prove an external model request succeeds.
- Fresh hosted inspection: the two designated owner accounts exist; **zero are email verified and zero currently hold Super Admin**. Complete verified onboarding and authorized role assignment before testing real settings. Never auto-confirm emails, hardcode passwords, or expose credentials.
- New function gateway compatibility with a real signed-in session still needs acceptance. Do not disable authentication to make a test pass; the function itself validates the user and Super Admin role before reading Vault credentials.
- Custom models must support the required API/tool or structured-output contract and be accessible under the provider account's billing/access settings. A connection test is not certification of every clinical task or model's medical safety.
- Full database/RLS suite and migration 018's 33 behavioral assertions remain open. The local database command was attempted and failed because no Postgres instance is listening on 54322; no Docker/psql CLI is installed.
- Task cost is still recorded as zero in the existing execution path; do not present this as actual provider billing. Synthetic connection tests may incur small provider charges and do not produce an itemized billing ledger.
- Existing request-limit exits can leave a queued AI task; this is a follow-up cleanup/audit issue, not fixed in this increment.
- Physical iOS/Android acceptance, real role journeys, payment integration (deferred), notification-provider delivery, backup/restore drill, and closed pilot remain open.

## How to test after verified Super Admin access

1. Use the connected Admin console, not the sample preview.
2. Open **AI provider**, choose OpenAI or Anthropic, select/enter a compatible exact model ID, paste the key into **New API key**, then save the sealed credential yourself.
3. Click **Test connection**. It tests saved values, not unsaved text. Require a verified result for the intended provider/model before proceeding.
4. Click **Make active provider**. Run fictional patient guidance and a fictional dentist draft, including field review and finalization. Check permission denials for ordinary Admins/patients.
5. To change models later, use **Save model**, test again, then repeat the relevant task acceptance checks. Retest both providers independently.

Local UI URLs: mobile `http://localhost:8082/`; synthetic Admin preview `http://127.0.0.1:4175/`; connected Admin development console `http://127.0.0.1:5174/`. Server availability must be rechecked in a later session.

## Claude coordination

Claude's read-only review at `7f55d9a` confirmed that empty RLS-filtered allergy results cannot mean “no known allergies.” Its separate implementation is now pushed on `claude/prescribing-safety-context` at `6fb30c124fa918fb2051b96c96c767d1355d37cd`. Codex fetched and confirmed that commit and the five-file scope. Claude reports 81 mobile tests passing; this is a worker-reported result, not independently rerun evidence. The branch is NOT integrated. Review and rerun its tests before deliberate integration. Clinical-read auditing remains an explicitly open issue.

Preserve the established pearl/navy/mint design, mascot, desktop sidebar and mobile navigation. The Impeccable review treated this as a settings extension, not a visual redesign. Individual dentists/patients remain the priority; clinic business operations remain deferred.
