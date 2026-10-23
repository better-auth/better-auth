---
"better-auth": patch
---

Email OTP code checks now lock out after `allowedAttempts` wrong codes for an unregistered address, and for a change-email address that belongs to another account, as they do for any other address, so the responses no longer reveal whether an account holds the address. On a schema with a unique `verification.identifier`, sign-up with `sendVerificationOnSignUp`, repeated `request-email-change` calls and repeated server-side `createVerificationOTP` calls now replace a pending code instead of failing.
