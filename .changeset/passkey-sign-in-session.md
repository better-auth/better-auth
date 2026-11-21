---
"@better-auth/passkey": patch
---

Fixed pages that check `useSession()` right after `signIn.passkey()` or `addPasskey({ createSession: true })` redirecting back to the sign-in page. The call now resolves once the session has reloaded.
