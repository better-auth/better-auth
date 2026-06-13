---
"@better-auth/oauth-provider": minor
---

Machine clients can now register through protected dynamic client registration. Send an RFC 7591 initial access token in the `Authorization: Bearer` header to `POST /oauth2/register` and validate it with the new `validateInitialAccessToken` option to provision public or confidential clients without a user session, optionally tagging each with an owner `referenceId`. Confidential `client_credentials` clients no longer need to send a placeholder `redirect_uris`.

The client-creation endpoints now consistently return `201 Created`. The admin create endpoints (`/admin/oauth2/create-client` and `/oauth2/create-client`) previously returned `200 OK`.
