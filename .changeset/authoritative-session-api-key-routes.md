---
"@better-auth/api-key": patch
---

Fixes revoked sessions still being able to create or update API keys when the session cookie cache is enabled and a plugin or hook resolved the session earlier in the same request. Key creation and updates now perform an authoritative session read, so a session revoked server-side — including the revocation performed when a user is banned — can no longer mint a key that outlives it.
