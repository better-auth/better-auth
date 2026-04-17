---
"better-auth": patch
---

Allow removing a phone number with `updateUser({ phoneNumber: null })`. The verified flag is reset atomically. Changing to a different number still requires OTP verification through `verify({ updatePhoneNumber: true })`.
