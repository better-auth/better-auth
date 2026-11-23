---
"better-auth": patch
---

Apply `overrideUserInfoOnSignIn` when a returning user signs in through `oAuthProxy`. Before, the proxied sign-in left the stored user unchanged.
