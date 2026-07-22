---
"better-auth": minor
"@better-auth/oauth-provider": patch
---

Add `session.onSessionExpired` callback for detecting natural session expiry during validation (including `getSession`, session lookups, and OAuth Provider checks). OAuth paths clean up expired sessions after notifying so the hook does not repeat on retries.
