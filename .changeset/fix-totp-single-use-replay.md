---
"better-auth": patch
---

fix(two-factor): reject reused TOTP codes on the step-up verification path

When `verifyTOTP` ran with an already-active session (step-up / re-verification),
a code that had already been successfully validated was accepted again and again,
because the `twoFactor` row recorded no consumed time step and — unlike the
sign-in path — there is no per-challenge verification row to consume. Step-up
verification now records the last consumed time step (`lastUsedStep`) and rejects
any candidate step at or below it, enforcing the one-time use required by
RFC 6238 §5.2 and OWASP ASVS 5.0 §6.5.1. The new field is nullable, so existing
rows are treated as having no consumed step and the first verification always
succeeds.
