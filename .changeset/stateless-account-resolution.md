---
"better-auth": patch
---

Resolve the OAuth account in stateless mode (no `database`/`secondaryStorage`) when the encrypted account cookie's `userId` differs from the session's resolved user id. In stateless setups the user id is not stable across instances, so `getAccessToken`/`accountInfo` could fail with `Account not found` and `setCookieCache` could drop the account cookie even though the cookie was valid. The account cookie is now trusted by provider identity when there is no persistent store to validate against.
