---
"better-auth": patch
"@better-auth/passkey": patch
---

Passkey registration, device authorization, two-factor enrollment and verification, social account linking, and phone number changes now reject a session revoked in the database or secondary storage, even when cookie caching is enabled. Sessions created from API keys are refused on these routes, except two-factor enrollment and phone number changes.
