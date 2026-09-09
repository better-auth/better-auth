---
"better-auth": minor
"@better-auth/core": minor
---

feat(auth): add `sendResetPasswordNoAccount` callback for `/request-password-reset`

Optional callback on `emailAndPassword` config, triggered when the endpoint receives an email with no associated account. Lets you send a "create your account" email without breaking enumeration protection — the HTTP response is identical regardless of whether the email exists.
