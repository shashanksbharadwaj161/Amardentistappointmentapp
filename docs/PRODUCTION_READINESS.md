# Production Readiness and Closed-Pilot Runbook

## Safe demo data

The built-in preview uses fictional Bangladesh data only: Shapla Dental Studio, Dr. Ayesha Rahman, Dr. Farhan Karim, and Dr. Nusrat Jahan. No preview person represents a real clinician, BMDC credential, patient, clinic, or endorsement. Live clinic, professional, service, and schedule data can be entered through the app during testing.

## Before a closed pilot

- Confirm the hosted migration history still contains every version through `202609050014` and rerun all pgTAP suites after any database change.
- Confirm the 10 deployed invitation, prescription, payment, subscription, AI, key-rotation, and notification functions match the repository commit; then verify their authenticated or signed success/failure paths.
- Activate the two authorized Super Admin accounts only at the final access ceremony. Do not hardcode passwords.
- Add the AI key through the Super Admin write-only control, then confirm only a masked suffix is returned.
- Keep experimental X-ray AI disabled until a practicing dentist approves the validation protocol.
- Configure push, email, and SMS providers; trigger a retry, provider failure, and duplicate event test.
- Configure bKash, Nagad, and RevenueCat only after provider approval. Keep mock labels visible beforehand.
- Replace the privacy notice and terms drafts with reviewed documents, production entity/contact details, and exact retention periods.
- Complete accessibility and large-font checks in English and Bangla on physical iOS and Android devices.
- Validate every role matrix with real test accounts: patient, dentist, owner, manager, front desk, Admin, Super Admin.

## Backup and restore drill

1. Record the project reference, migration commit, backup timestamp, and drill owner without copying secrets into the report.
2. Take a Supabase-supported backup and confirm Vault key portability requirements before restoring to a different project.
3. Restore into an isolated non-production project.
4. Apply no manual schema changes. Compare migration history and table/function/policy counts.
5. Run all pgTAP behavior suites, verify private storage remains private, and verify Vault secrets are readable only from service-only functions.
6. Confirm one patient, clinic, appointment, finalized record, invoice, audit event, and AI audit task reconcile against the source snapshot.
7. Destroy or retain the drill project according to the reviewed retention policy. Record deviations and remediation.

## Pilot acceptance journey

Patient: verify email, create family profile, discover only approved providers, hold and book a slot, receive a notification, check in once, message the clinic, view only finalized records, control cross-clinic consent, and use non-diagnostic AI guidance.

Dentist: work only in authorized clinics, run the day calendar, check in or add a walk-in, document an encounter, review every AI field, finalize a prescription and record, and confirm the patient can see the finalized result.

Clinic owner/manager/front desk: prove clinic-scoped permissions, schedules, waitlist, finance, inventory, and lab operations. Front desk, managers, owners, and regular Admins must not see clinical detail unless they are also the treating dentist.

Super Admin: verify professionals, investigate audit and support cases, configure plans/commission/flags/limits, rotate the AI key without reading it back, and perform any exceptional clinical access only through the reason-required audited route.

## Launch blockers

Real payment certification, store accounts, final legal/privacy review, practicing-dentist clinical validation, production provider credentials, physical-device acceptance, monitoring review, and a completed restore drill are external launch gates. A successful local build is not evidence that these approvals exist.
