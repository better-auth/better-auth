---
"@better-auth/oauth-provider": patch
---

`provider.authenticateClient()` accepts a `clientId` option for plugin endpoints whose follow-up requests can leave out `client_id`, because state the endpoint stored already names the client. Such a request is authenticated as that client, and a request that names another client fails with `invalid_client`.
