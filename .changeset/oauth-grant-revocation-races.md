---
"@better-auth/oauth-provider": minor
---

Revoking a grant now also stops a token request for that grant that is still issuing tokens, so its tokens can no longer survive the revocation. This covers reusing an authorization code while its first redemption is in progress, and reusing or revoking a refresh token while the grant is being refreshed: the in-flight request fails with `invalid_grant` and its tokens are deleted. As a result, two overlapping redemptions of one code by its client now both fail.
