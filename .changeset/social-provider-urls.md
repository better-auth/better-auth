---
"@better-auth/core": patch
---

Fix Paybin endpoints for trailing-slash issuers. Invalid scheme-less issuer or authority URLs now fail during provider initialization instead of at sign-in.
