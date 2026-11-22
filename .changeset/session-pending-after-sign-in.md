---
"better-auth": patch
---

Fixed pages that check `useSession()` right after signing in, including from `onSuccess`, redirecting back to the sign-in page. Auth calls now resolve once the session has reloaded.
