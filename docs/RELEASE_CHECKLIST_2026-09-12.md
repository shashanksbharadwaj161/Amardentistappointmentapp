# Amar Dentist — release verification checklist

Checked boxes mean the stated observation passed, not whole-product acceptance.
Clinics remain deferred. Never use the unrelated SORKn8n container or port 5678.

## Verified baseline

- [x] Owner email verified and designated Super Admin role present (live database).
- [x] Local database suite: 677 assertions, 19 files passed.
- [x] Recorded backend suite: 133 tests passed.
- [x] Recorded Admin/mobile/domain suites: 100 / 83 / 34 tests passed.

## Current completion pass

- [ ] Collect, integrate, and independently review Claude clinical changes.
- [ ] Rerun combined local tests, typechecks, lint, secret scan, and builds.
- [ ] Verify Admin and Super Admin navigation and permission boundaries.
- [ ] Verify dentist role revocation clears clinical drafts; normal refresh preserves drafts.
- [ ] Verify patient/dentist journeys and responsive browser behavior.
- [ ] Deploy migrations 020–022 and updated AI task handler; verify hosted behavior.
- [ ] Verify actual Super Admin sign-in and settings changes across open sessions.
- [ ] Real Anthropic connection and fictional clinical-task acceptance (private key required).
- [ ] Real OpenAI acceptance (OpenAI key required).
- [ ] Physical iPhone acceptance (user device required).
- [ ] Physical Android acceptance (user device required).
- [ ] Payment-provider acceptance (credentials deferred by user).
- [ ] Notification-provider delivery verification.
- [ ] Backup/restore drill and client pilot acceptance.
- [ ] Update handoff documentation, commit, and push reviewed work to GitHub.

## Known boundaries

- Full vendor-inclusive database lint previously failed inside third-party extensions;
  application-owned public schema lint passed. Do not conceal this distinction.
- Super Admin clinical access is an audited read-only snapshot, not unrestricted
  impersonation or destructive alteration of finalized clinical records.
- Local test success does not establish hosted, payment, AI-provider, or device acceptance.
- Latest source fixes are not deployed until their deployment item is checked.
