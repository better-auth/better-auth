---
"@better-auth/oauth-provider": patch
---

The token endpoint now refuses to issue tokens to a user banned by the admin plugin and returns `invalid_grant`. Previously a client holding an `offline_access` refresh token kept getting new access tokens for the banned user, and an authorization code issued before the ban could still be exchanged. A ban past its `banExpires` no longer blocks the grant, and the refresh token works again once the ban ends.
