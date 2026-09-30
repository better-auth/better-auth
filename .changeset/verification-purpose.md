---
"better-auth": patch
---

Magic Link verification now accepts only records issued for Magic Link. Magic
Link records and database-backed OAuth or SAML state use separate verification
identifier prefixes. Links and database-backed sign-ins started before the
upgrade cannot complete; request new Magic Links and restart those sign-ins.
Upgrade servers sharing verification storage together, and update
`verification.storeIdentifier.overrides` rules for these flows to match the new
`magic-link:` and `auth-state:` prefixes. The link token, callback state,
endpoints, and public option types are unchanged.
