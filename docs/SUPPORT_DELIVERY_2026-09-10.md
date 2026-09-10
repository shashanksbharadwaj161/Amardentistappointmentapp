# Patient support delivery

## Implemented

- Patient More menu and desktop sidebar now expose Contact support.
- English/Bangla form supports app/account, privacy, visit disputes, refunds, and content reports.
- Validated, trimmed descriptions are submitted through the existing authenticated `open_support_case` RPC. The server derives the requester from authentication; the client cannot assign roles or an opener.
- Request history reads the latest 50 requests for the current account, with status and support responses. Database participant policies remain the authorization boundary.
- Preview requests are explicitly not sent or saved. Failed submissions preserve input and advise refreshing history before retrying an uncertain result.
- Synchronous submission lock blocks duplicate taps. Loading, validation, empty, backend-error, and success states are provided.

## Verification boundary

Helper and screen tests cover validation, RPC contract, preview isolation, account requirement, backend failures, filtered history, duplicate taps, and displaying an Admin response. These use mocked backend responses, not live role acceptance.

The visible localhost app was signed out during this pass. Live patient submission → Admin queue → resolution → patient refresh remains unverified. No new database migration or production role grant was made in this pass. Generic content reports do not yet carry an appointment/review reference; contextual reporting remains separate work.

## Manual acceptance

1. Sign into a test patient account at localhost:8082, open More → Contact support.
2. Submit a fictional non-clinical issue and verify one new request appears.
3. In an authorized Admin console, refresh Cases and select that request. Set a status and non-clinical response, then save.
4. Refresh the patient's requests; verify the response and status.
5. A second patient must not see the first patient's request. A patient must not call Admin case mutation successfully.

## Remaining sequence

Finish live support acceptance, then user roles/revocation, clinic inventory/lab/finance operations, and the remaining clinical editing surfaces. Real payment, subscription, AI-provider, device, and pilot acceptance remain separate from source implementation. Do not translate passing component tests into a whole-app completion percentage.
