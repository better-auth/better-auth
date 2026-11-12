---
"better-auth": minor
---

Generic OAuth providers can now sign in through pushed authorization requests (RFC 9126). The new `pushedAuthorizationRequest` option defaults to `"auto"`, which pushes the request when discovery reports `require_pushed_authorization_requests`. Set it to `true` to always push. The pushed request authenticates the client with the provider's token endpoint authentication, and the browser is redirected with only `client_id` and `request_uri`. Set `pushedAuthorizationRequestUrl` for providers configured without discovery.
