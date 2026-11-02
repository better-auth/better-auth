---
"better-auth": patch
---

Pass the verification purpose (`type: "phone-verification" | "password-reset"`) to the phone number plugin's `verifyOTP` callback, allowing custom verifiers to distinguish between phone verification and password reset flows.
