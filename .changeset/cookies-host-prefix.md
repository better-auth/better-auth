---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/electron": patch
"@better-auth/expo": patch
---

Add `advanced.useHostCookiePrefix` to name cookies with the `__Host-` prefix, reject configurations that are incompatible with it (`crossSubDomainCookies`, a custom cookie `path`, `useSecureCookies: false`), and offer an opt-in `migrateSecureCookies` that keeps existing `__Secure-` sessions alive by re-issuing them as `__Host-` cookies on their next request.
