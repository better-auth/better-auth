---
"@better-auth/oauth-provider": minor
---

Access tokens can now use a different signing algorithm or key from ID tokens, with `resourceDefaults: { signingAlgorithm, signingKeyId }`. The defaults apply to every resource that does not set its own `signingAlgorithm` or `signingKeyId`, and ID tokens keep the JWT plugin's primary key.
