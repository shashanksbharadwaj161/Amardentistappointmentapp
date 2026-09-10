# Responsive navigation, realtime and live-function checkpoint

Recorded: 2026-09-10

Read this checkpoint first, then `CHECKPOINT_2026-09-09.md`, `CHECKPOINT_2026-09-07.md`, `CONTINUATION.md`, `PRODUCT.md`, and `DESIGN.md`. This is an evidence handoff, not a declaration that the six-phase product is complete.

## 1. Repository state and commit boundary

- `b9cdb54` is the pushed map/calendar baseline.
- `fc0551e` repairs the realtime subscription lifecycle.
- `79bc55d` adds the responsive role-aware app navigation and is the reviewed `main` head for this checkpoint.
- Both commits are pushed on `main`.
- The navigation commit uses the repository's neutral team identity. No credentials or personal identity data were added.

## 2. Responsive navigation delivered

The Expo app now has a persistent 248px sidebar at widths of 1280px and above and exactly five compact bottom destinations below that breakpoint. Both layouts use existing Expo Router routes rather than placeholder destinations.

Implemented behavior:

- Patient compact navigation: Home, Find, Visits, Records, More.
- Professional compact navigation: Home, Calendar, Visits, Inbox, More.
- Desktop sidebar groups primary and secondary destinations and keeps account access visible below a scrollable navigation region.
- Menu visibility follows the profile's assigned roles. Team and business tools remain manager/owner-only, while invalid professional state falls back to patient navigation.
- Public, sign-in, registration, password reset, and auth callback routes do not show the signed-in shell.
- Active child routes resolve to one navigation destination. In particular, Manage schedule owns its sidebar state, compact secondary routes activate More, and professional chat activates Inbox.
- English and Bangla navigation labels are present.
- Safe-area bottom placement, native keyboard hiding, zero-min-width content, and zero-min-height sidebar scrolling protect controls from overlap and clipping.
- Workspace switching clears its busy state when persistence returns an error or throws, shows a recoverable error, and redirects only after success.
- The synthetic preview profile shows a compact persistent notice on every signed-in route. The check is based on the fixed preview profile identifier, so a real profile is not labelled preview because of an email resemblance.
- Professional dashboard copy lists assigned roles and does not call front-desk staff, managers, or owners doctors or verified dentists.

## 3. Realtime repair

Repeated entry to the professional calendar reproduced a crash caused by deterministic Supabase channel-name reuse while a previous channel was still leaving. The repair in `fc0551e` gives each subscription instance a unique channel name and makes unsubscribe cleanup idempotent.

After a reload, revisiting the calendar worked in the browser. This confirms the reproduced browser path; it does not establish cross-device realtime delivery or long-running production stability.

## 4. Automated verification collected on September 10

Latest mobile command:

```text
pnpm --filter @amar-dentist/mobile test -- --runInBand
```

Result: **9 suites passed, 47 tests passed, 0 failed**.

The mobile suite includes navigation selection/permissions, shell accessibility state, preview identity, failed workspace switching, realtime subscription cleanup, calendar behavior, component behavior, auth links, and Phase 3–5 client logic.

Additional verification reported in the same final pass:

- Shared domain tests: **34 passed**.
- Admin tests: **3 passed**.
- Edge Function tests: **63 passed**.
- Workspace TypeScript: passed.
- Workspace lint: passed with one pre-existing Admin effect warning.
- Secret scan: **291 files passed** in the latest post-export run.
- UI audit: zero findings.
- Full recursive build: passed while preview mode was enabled temporarily for browser verification.
- After restoring preview mode to false in the ignored mobile environment file, `pnpm --filter @amar-dentist/mobile build` exited 0 and exported web, iOS, and Android bundles.
- The final post-export diff check passed.

The preview-disabled export is valid local bundle evidence, but it is not a signed store build or physical-device acceptance. The ignored environment file was not committed and its contents must not be copied into logs or documentation.

## 5. Browser verification collected on September 10

At 390px compact width, browser checks covered map interaction, filters, slot selection, hold/release, bottom navigation, account access, and patient/professional mode switching. The five bottom destinations stayed accessible without horizontal overflow.

At 1280×720, the sidebar rendered at 248px, its account footer remained visible, the navigation region could scroll, the map retained usable width, and document content did not overflow horizontally. The calendar revisit also worked after the realtime repair.

A post-repair Calendar → More → Bangla → Calendar regression passed without an uncaught error, and the Bangla calendar rendered correctly. The actual viewport and document width were both 929px because the intended 390px override did not take effect. This is valid Bangla/realtime revisit evidence, but it is not a 390px Bangla compact-layout check. The earlier 390px general responsive checks remain valid.

## 6. Independent review

The separate navigation/realtime review returned **PASS_WITH_NOTES** against the clean `79bc55d` state. Its focused verification included 17 navigation/realtime tests and 15 relevant Edge Function tests.

The review's non-blocking note was pre-existing sign-out behavior: the auth client can return an error object without throwing, while the current provider clears local session state regardless. This was not introduced by the navigation increment and was not changed in this scope. It should be handled in a future authenticated-session hardening pass rather than silently treated as verified.

## 7. Hosted function status at checkpoint time

- The committed `clinic-invite` wrapper source was deployed. Live `OPTIONS` changed from HTTP 503 to HTTP 204.
- The committed `payment-checkout` wrapper was also deployed from the reviewed source. Its live `OPTIONS` response changed from HTTP 503 to HTTP 204.
- Unauthenticated `POST {}` probes to both deployed functions returned HTTP 401 with the stable `UNAUTHORIZED_NO_AUTH_HEADER` gateway code, and no operation was performed.
- Real authenticated mutation success remains unverified. Current missing or invalid configuration paths fail closed; that is failure evidence, not delivery evidence.
- Do not claim payment readiness, invitation delivery, webhook readiness, or provider success until authenticated requests and configured provider callbacks are exercised end to end.

## 8. External review coordination

A separate Claude Code cloud session became accessible through a browser opened by the user. The lead sent a read-only review assignment for `79bc55d`, collected its report, checked its main findings against local source, and sent corrections for stale deployment claims and unsupported live-persistence/account claims. Claude acknowledged those corrections and completed the review without application changes or a commit/push.

The reconciled local synthesis is `docs/CLAUDE_CLIENT_REVIEW.md`. Claude's PASS_WITH_NOTES applies only to a narrated UI demonstration, not full client acceptance. Static review found missing patient support intake, role-governance controls and clinic back-office flows. The proposed next batch is patient support intake alone.

The cloud session is not a local shared-file bridge. Its optional cloud report was removed; the local synthesis was written by the lead from the observed chat and verified source. UI-selected model was Opus 4.8 at Medium effort; actual served-model and cost telemetry were unavailable.

## 9. What remains unverified

The full six-phase product is not complete. The September 7 gap list still applies, including missing physical-device and signed-build proof, live authenticated booking/payment/invitation/provider journeys, production configuration, clinical and legal validation, restore rehearsal, store readiness, and closed-clinic pilot acceptance.

Immediate continuation order:

1. Keep preview mode false for release work and do not commit or expose ignored environment files.
2. Verify authorized `clinic-invite` and `payment-checkout` POST behavior after required configuration is available.
3. Complete an exact Bangla navigation/layout regression at a confirmed 390px compact width.
4. Implement and verify the bounded patient support-intake batch described in the reconciled review; role governance and back-office workflows are later independent batches.
5. Continue the September 7 production-readiness and acceptance gaps. Do not revive the historical 87.84% estimate as a current completion claim.

## 10. Local testing endpoints

- `http://localhost:8082/`: normal mobile/web login configuration, with the ignored environment file restored to preview mode false. Server HTTP 200 checked.
- `http://127.0.0.1:4174/`: built admin console with normal login. The sign-in UI was observed; live role login was not performed.
- `http://127.0.0.1:4175/`: separate admin sample-data preview, started with VITE_E2E_MODE and VITE_DEMO_MODE for this process only. Preview entry and overview were checked in the visible browser. This deliberately has no Supabase client and is not real Super Admin access. Some overview wording still needs a persistent preview disclaimer before unattended client use.
- The temporary reviewed-source server on port 8793 was stopped and its browser tab closed after deployment.

An attempted process-only mobile preview on 8083 did not expose the sample-data entry: normal configuration remained visible on the first attempts, and the final isolated/minified attempt did not produce a usable page within this check. The trial server was stopped; do not use 8083 as a ready demo link. The earlier successful mobile preview checks used a temporary environment-file flag. A reproducible separately isolated preview launch still needs investigation. No release environment file was changed for this final attempt. Expo environment-isolation behavior was checked against the installed source and [official documentation](https://docs.expo.dev/guides/environment-variables/); the observed result remains unverified rather than assumed to match the documentation.
