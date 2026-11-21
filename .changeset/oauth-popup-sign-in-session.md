---
"better-auth": patch
---

Fixed pages that check `useSession()` right after `signIn.popup()` redirecting back to the sign-in page. The call now resolves once the session has reloaded.
