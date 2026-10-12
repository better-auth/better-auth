---
"better-auth": patch
"@better-auth/electron": patch
"@better-auth/expo": patch
"@better-auth/mcp": patch
---

Fix verification, password-reset, delete-account, and magic-link URLs with trailing-slash auth bases. Preserve registered OAuth callback URLs and provider IDs, honor custom popup callback paths, and respect auth base paths in OAuth proxy and client URLs.
