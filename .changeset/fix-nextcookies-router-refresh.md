---
"better-auth": patch
---

fix(next-js): replace cookie probe with header-based RSC detection in `nextCookies()` to prevent infinite router refresh loops

The `nextCookies()` before hook previously used `cookies().set()` to detect whether it was running in a Server Component context. In Next.js, `cookies().set()` unconditionally triggers router cache invalidation, causing infinite re-render loops when `getSession` was called from Server Actions.

The fix detects RSC context by inspecting the `RSC` and `next-action` request headers instead, which has zero side effects. This also eliminates the leaked `__better-auth-cookie-store` probe cookie.

Additionally, the two-factor `verifyTOTP` and `verifyOTP` enrollment flows now set the new session cookie before deleting the old session, preventing a brief window where `getSession` could return null.

Closes #8464, #8828, #6077
