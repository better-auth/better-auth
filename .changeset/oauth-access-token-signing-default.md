---
"@better-auth/oauth-provider": minor
---

JWT access tokens can now use a different signing algorithm or key from ID tokens with `resourceDefaults: { signingAlgorithm, signingKeyId }`. Setting either signing field on a requested resource overrides both defaults.
