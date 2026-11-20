---
"@better-auth/oauth-provider": minor
---

The token endpoint now exchanges an authorization code that carries no scopes for an access token with no scopes. Before, a request with an empty `scope` parameter, such as `scope=`, from a client that has registered scopes got a code that `/oauth2/token` then rejected with `400 invalid_scope` and the description "client does not allow scope ". The endpoint now ignores empty entries in a code's scope list. A code for a scope the client no longer has is still rejected.
