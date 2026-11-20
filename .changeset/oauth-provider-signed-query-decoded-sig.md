---
"@better-auth/oauth-provider": patch
---

Fix the signed OAuth query failing with `invalid_signature` when a proxy, router, or login page URL-decodes the query once. The check now accepts a `sig` whose `+` characters became spaces, and a `sig` written in the base64url alphabet. Signing is unchanged.
