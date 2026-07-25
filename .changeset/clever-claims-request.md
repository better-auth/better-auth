---
"@better-auth/oauth-provider": minor
---

The OIDC provider now honors the `claims.userinfo` authorization request parameter. A client can ask for individual standard claims, and the UserInfo endpoint returns the ones it can supply in addition to the scope-granted claims. The requested claims become part of the user's consent, and `claims_parameter_supported` is advertised in discovery.

A claim requested through `claims.userinfo` is honored for opaque access tokens. With a JWT access token, UserInfo returns only the claims the granted scopes cover, so request the backing scope when a client needs a specific claim.

This adds a `requestedUserInfoClaims` column to the OAuth access-token, refresh-token, and consent tables. Run your database migrations after upgrading.
