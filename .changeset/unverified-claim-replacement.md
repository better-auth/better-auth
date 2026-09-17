---
"better-auth": patch
---

Fix pre-registration account takeover in email verification. Verification proofs are keyed by email address, so a mailbox owner's code or link resolved whichever user row occupied the address — including one pre-registered by an attacker whose sign-up was silently absorbed by the anti-enumeration response. Re-registering an address that is still unverified under `requireEmailVerification` now replaces the pending claim: the stale credential is dropped, the latest registrant's credential is linked, and a fresh verification email is issued bound to that claim via a `claimId` token claim, so a proof issued for a superseded claim is rejected instead of verifying it. Only pure pending credential claims are replaceable — unverified rows carrying social accounts or live sessions are left untouched — and verified rows are never affected, preserving enumeration resistance.
