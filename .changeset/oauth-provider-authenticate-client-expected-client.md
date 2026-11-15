---
"@better-auth/oauth-provider": minor
---

`provider.authenticateClient()` accepts a `clientId` option for plugin endpoints whose follow-up requests can leave out `client_id`, because state the endpoint stored already names the client. Such a request is authenticated as that client, and a request that names another client fails with `invalid_client`. `issueAuthorizationCode()` reads the `client_id` in its `query` the same way, so a later request that issues the code can leave `client_id` out too.
