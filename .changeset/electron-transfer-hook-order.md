---
"@better-auth/electron": minor
"better-auth": minor
"@better-auth/core": minor
---

Electron desktop sign-in now completes only after required two-factor verification and the other sign-in after-hooks, regardless of plugin order, and authorization codes require the issuing browser session to remain valid until exchange. Plugin after-hooks on credential sign-in routes now run after the built-in two-factor challenge and must handle a null new session while verification is pending.
