---
"@better-auth/oauth-provider": minor
---

`provider.validateAuthorizationRequest()` checks an authorization request before the user signs in, so a plugin endpoint that signs users in over several requests can reject an invalid request on the first one. It runs the checks `/oauth2/authorize` runs, throws the same OAuth errors as 400 responses without redirecting, writes nothing, and returns the validated query with a public view of the client. The result is advisory: the endpoint still authenticates confidential clients, and `issueAuthorizationCode()` checks the request again.
