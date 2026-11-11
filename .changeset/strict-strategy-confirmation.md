---
"@better-auth/oauth-provider": patch
---

A malformed `confirmation` from a `clientAuthentication` strategy, or one passed to `issueTokens` or `resolveConfirmation`, now fails the request with `server_error` instead of issuing a token. A confirmation must have exactly one member, `jkt` or `x5t#S256`, and its value must be a non-empty string. Before, a confirmation with both members produced a token that DPoP proofs treated as DPoP-bound only, which dropped its certificate binding.
