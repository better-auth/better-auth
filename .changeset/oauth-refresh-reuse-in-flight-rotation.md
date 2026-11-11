---
"@better-auth/oauth-provider": patch
---

When a client sent the same refresh token twice at nearly the same time, one of the requests could fail with a 500 error. This happened when the second request arrived after the first had already rotated the token. The second request counts as refresh token reuse and revokes the token family, including the tokens the first request was still issuing, so the first request then failed on the database insert. Both requests now return `invalid_grant`, and the client must sign in again, as after any detected reuse. The same applies when an authorization code is redeemed twice at once.

Only opaque access tokens on databases that enforce foreign keys were affected. JWT access tokens, and duplicate refreshes inside `refreshTokenReuseInterval`, were not.
