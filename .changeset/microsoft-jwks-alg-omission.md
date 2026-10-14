---
"@better-auth/core": patch
---

Fixed Microsoft Entra ID sign-in with an ID token (`signIn.social` with `idToken`, and linking an account with an ID token) rejecting every token. Microsoft publishes its signing keys without an `alg` field, which made verification fail. Those keys are now treated as RS256, and Microsoft ID tokens signed with any other algorithm are rejected. The redirect sign-in flow was not affected.
