---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/expo": patch
"@better-auth/electron": patch
---

Add `cookieSecurity` and `cookieNamespace` options across Better Auth, Expo, and Electron. This adds opt-in `__Host-` auth cookies and exact-prefix session and Expo OAuth state reads. Existing option aliases remain available until a future minor release.
