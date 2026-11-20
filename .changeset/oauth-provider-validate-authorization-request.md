---
"@better-auth/oauth-provider": minor
---

`provider.validateAuthorizationRequest()` checks an authorization request before the user signs in, so a plugin endpoint that signs users in over several requests can reject an invalid request on the first one. It applies the same request validation as `/oauth2/authorize` and leaves the `beforeAuthorization` hook to `issueAuthorizationCode()`. It throws the same OAuth errors as 400 responses without redirecting, issues no code, stores no pushed request, and returns the validated query with a public view of the client. The result is advisory: the endpoint still authenticates confidential clients, and `issueAuthorizationCode()` checks the request again.
