---
"@better-auth/oauth-provider": minor
---

`updateOAuthClient` now rejects a new `post_logout_redirect_uris` entry with `invalid_client_metadata` when the client may use RP-initiated logout and none of its `redirect_uris` share the entry's scheme, host, and port. Before, a client's owner could point logout redirects at any origin.

The rule matches registration: loopback hosts match on any port, and private-use URIs match on scheme and authority. Entries the client already has are kept, so post-logout URIs an administrator set stay valid, and `adminUpdateOAuthClient` is not limited by the rule.
