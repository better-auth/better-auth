---
"@better-auth/oauth-provider": patch
---

Sign the OAuth query with a base64url `sig` so the signature is not corrupted when a proxy, router, or login page url-decodes the query once. Signatures using the standard base64 alphabet are still accepted, so links issued before this change keep working.
