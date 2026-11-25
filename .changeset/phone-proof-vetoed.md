---
"better-auth": patch
---

Phone number sign-in for an account with an unverified number now fails with `FAILED_TO_CREATE_VERIFICATION` when a `verification.create.before` hook keeps the credential proof from being stored. Before, it sent a verification code that could not complete the sign-in.
