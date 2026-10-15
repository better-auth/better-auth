---
"better-auth": patch
---

fix(two-factor): prevent TOTP code replay on verification (RFC 6238 §5.2)

TOTP codes were reusable within their ±1-step window. Verification now matches
the window with constant-time comparison (earliest step wins), then atomically
reserves a step-keyed `totp-used:<id>:<step>` tombstone via the existing
verification table (or secondary-storage increment): first writer wins and
replays fail with INVALID_CODE. Covers step-up and sign-in cross-challenge;
enrollment verification is exempt and pre-session failures roll back fail-closed.
Zero schema change.
