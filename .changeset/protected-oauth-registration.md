---
"@better-auth/oauth-provider": minor
---

Machine clients can now register without a user session. Send an RFC 7591 initial access token in the `Authorization: Bearer` header to `POST /oauth2/register`, and validate it with the new `validateInitialAccessToken` option. This provisions public or confidential clients directly, each optionally tagged with an owner `referenceId`.

The client-creation endpoints now return `201 Created` for a newly created client. They previously responded `200 OK`.
