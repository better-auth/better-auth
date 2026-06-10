---
"@better-auth/electron": patch
---

Require S256 PKCE for Electron auth transfers. The transfer flow previously defaulted a missing `code_challenge_method` to `plain` and the token exchange fell back to a plain string comparison for any non-`s256` method. In `plain` mode the verifier equals the challenge, which already appears in the sign-in URL query, so the comparison did not add a meaningful check. Missing, unknown, and `plain` methods are now rejected at minting (`handleTransfer`, `/electron/transfer-user`, `/electron/init-oauth-proxy`) and at exchange (`/electron/token`). The official Electron client already uses S256, so existing flows are unaffected.
