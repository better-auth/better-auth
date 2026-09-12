---
"better-auth": major
---

Use React Suspense for the initial pending state of `useSession` and client plugin query hooks. React query hooks no longer return `isPending` and now require React 19 or newer.

Render React query hooks only in the browser, leaving the nearest Suspense fallback in server-rendered HTML. Use React DOM's `browser()` API when available, with a server-error bailout for stable React 19. Server Components should await `auth.api.getSession` with request headers.
