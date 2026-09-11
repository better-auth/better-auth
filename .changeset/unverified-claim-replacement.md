---
"better-auth": patch
---

Fix pre-registration account takeover in email verification. Verification codes and links are keyed by email address, so a mailbox owner's proof resolved whichever user row occupied the address — including one pre-registered by an attacker whose sign-up was silently absorbed by the anti-enumeration response. Re-registering an address that is still unverified under `requireEmailVerification` now replaces the pending claim: the row's unproven accounts and sessions are stripped, the latest registrant's credential is linked, and a fresh verification email is issued, so the code verifies the claim made by the person proving mailbox ownership.
