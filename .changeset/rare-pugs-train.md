---
"@better-auth/passkey": minor
---

Add `verifyPasskey` for step-up authentication — verify a passkey assertion without creating a session. New `POST /passkey/verify-assertion` endpoint and `authClient.passkey.verifyPasskey()` client method performing full WebAuthn verification (challenge, assertion, counter update) but return `{ verified, userId, credentialId }` instead of creating a session.
