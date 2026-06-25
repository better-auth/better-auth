---
"better-auth": patch
---

Two-factor verification now locks out after five wrong codes per sign-in challenge for TOTP and backup codes. Once the limit is reached the challenge is rejected with `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, and a new sign-in is required to try again.

During a rolling deploy, two-factor challenges issued by the previous version may prompt the user to sign in again; this clears once the deploy completes.
