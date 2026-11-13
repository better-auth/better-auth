---
"better-auth": minor
---

Generic OAuth providers can now sign in through pushed authorization requests (RFC 9126). The new `pushedAuthorizationRequest` option defaults to `"auto"`, which pushes the request when discovery reports `require_pushed_authorization_requests`. Set it to `true` to always push, or to `false` to never push. The pushed request authenticates the client with the provider's token endpoint authentication, and the browser is sent to the authorization endpoint with only `client_id` and `request_uri` added. Set `pushedAuthorizationRequestUrl` for providers configured without discovery.
