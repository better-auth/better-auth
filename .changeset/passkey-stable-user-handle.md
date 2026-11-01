---
"@better-auth/passkey": patch
---

Add `registration.getUserHandle` to set a stable WebAuthn user handle per user. When set, password managers replace a user's existing passkey instead of saving a second entry. Without it, every registration keeps using a random handle.
