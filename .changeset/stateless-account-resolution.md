---
"better-auth": patch
---

Resolve the OAuth account in stateless mode (no `database`/`secondaryStorage`) when the encrypted account cookie's `userId` differs from the session's resolved id. The user id isn't stable across instances without a persistent store, which made `getAccessToken`/`accountInfo` fail with `Account not found` and `setCookieCache` drop a valid account cookie; the cookie is now trusted by provider identity in that case.
