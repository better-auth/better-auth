---
"@better-auth/passkey": patch
---

Answer `400 FAILED_TO_VERIFY_REGISTRATION` instead of `500` when a passkey registration response fails WebAuthn verification (challenge, origin or RP ID mismatch). Failures after verification still answer `500`.
