---
"better-auth": patch
---

Make TOTP codes single-use per RFC 6238 §5.2. A verified code can no longer be replayed within its acceptance window — including on a fresh sign-in challenge or by concurrent requests. Adds a nullable `lastUsedStep` column to the `twoFactor` table; run the CLI migration (`npx auth migrate`) after upgrading.
