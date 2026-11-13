---
"@better-auth/oauth-provider": minor
---

Clients created through dynamic client registration or a Client ID Metadata Document can now use RP-initiated logout at `/oauth2/end-session` when you set the new `clientRegistrationEnableEndSession` option. Before, only clients an administrator created with `enable_end_session: true` could log out, and every other client was refused.

Pass `true` to allow it for every such client, or a function that decides from the client's validated metadata and its `registrationSource`. The option defaults to `false`, so existing setups behave as before. Better Auth decides when it creates the client, and a metadata document refresh never changes the decision.

A client allowed to log out must keep each `post_logout_redirect_uris` entry on the scheme, host, and port of one of its `redirect_uris`, so logout never redirects users anywhere authorization could not. Loopback hosts such as `localhost` and `127.0.0.1` match on any port, and private-use URIs such as `com.example.app:/logout` match on scheme and authority. A metadata document client may also use its `client_id` origin. Registration or a refresh that breaks this rule fails with `invalid_client_metadata`.
