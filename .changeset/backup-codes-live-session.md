---
"better-auth": minor
---

With a server-side session store, generating two-factor backup codes now requires a session that is still active in the store, like the other sensitive routes, so sessions created from API keys with `enableSessionForAPIKeys` are refused.
