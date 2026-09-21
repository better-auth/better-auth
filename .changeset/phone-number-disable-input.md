---
"better-auth": patch
---

Add a `disablePhoneNumberInput` option to the phone number plugin. When enabled, `phoneNumber` is treated as a non-writable user field (`input: false`), so it can only be attached to an account through a verified flow — `signUpOnVerification`, or a session-bound `/phone-number/verify` with `updatePhoneNumber: true` — rather than being accepted as plain sign-up or `update-user` input.
