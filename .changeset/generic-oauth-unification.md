---
"better-auth": minor
"@better-auth/electron": patch
"@better-auth/expo": patch
"@better-auth/oauth-provider": patch
---

Unify generic OAuth into core social sign-in flow. Generic OAuth providers now use `signIn.social` + `callback/:id` instead of dedicated plugin endpoints.
