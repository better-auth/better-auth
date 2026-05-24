---
"@better-auth/passkey": patch
---

A WebAuthn challenge can now only be used once. Two concurrent passkey verification requests carrying the same challenge cookie can no longer both succeed; the second now fails with `CHALLENGE_NOT_FOUND`. Failed verification also surfaces the actual error status: a failed `verifyPasskeyRegistration` returns `400 FAILED_TO_VERIFY_REGISTRATION` instead of `500 Internal Server Error`, and a failed `verifyPasskeyAuthentication` returns `401 AUTHENTICATION_FAILED` instead of `400 AUTHENTICATION_FAILED`.
