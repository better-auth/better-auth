---
"better-auth": patch
---

fix(session): preserve real `session.expiresAt` across stateless `refreshCache` cycles

When `cookieCache.refreshCache` was enabled without a database, the stateless
refresh path on `/get-session` overwrote `session.expiresAt` with
`now + cookieCache.maxAge`. The corrupted value was both returned in the
response and embedded in the next JWE cookie, so subsequent refreshes treated
the session as expiring with the cache TTL (e.g. 5 minutes) instead of the
real `session.expiresIn` (e.g. 7 days). `setCookieCache` already derives the
cookie's own TTL from `authCookies.sessionData.attributes.maxAge`, so the
override served no purpose other than to corrupt the public expiry — it is now
removed.
