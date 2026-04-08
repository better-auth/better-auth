---
"@better-auth/passkey": minor
---

Improve passkey registration naming fallback by prioritizing explicit input name, then custom `getAuthenticatorName({ aaguid })`, then known AAGUID provider suggestions.
