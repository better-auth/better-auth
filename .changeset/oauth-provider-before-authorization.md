---
"@better-auth/oauth-provider": minor
---

A new `beforeAuthorization` option runs your policy on each authorization request after validation, including pushed requests, before the provider sends the user to sign in or consent. Return `{ prompt: "login" }` to require a new sign-in even with a live session, or throw an `APIError` with an OAuth `error` to refuse the request: the client gets the error at its `redirect_uri` with `state` and `iss`, and neither a code nor the `request_uri` is used up. Provider extensions can set the same hook, and `issueAuthorizationCode()` runs it too. This lets a deployment enforce `acr_values`, which the provider still treats as voluntary by default.
