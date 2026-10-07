---
"@better-auth/api-key": patch
---

fix(api-key): allow server-side org key creation without userId

Server-side trusted callers can now create organization-owned API keys without
specifying a `userId`. Previously, `auth.api.createApiKey` with
`references: "organization"` threw UNAUTHORIZED when called without `userId`.

The org authorization path is now split into client (membership + permission
check) vs server-side (org existence only).
