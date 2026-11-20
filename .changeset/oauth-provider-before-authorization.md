---
"@better-auth/oauth-provider": minor
---

A new `beforeAuthorization` option runs your policy on each authorization request after validation, including pushed requests, before the provider sends the user to sign in or consent at `/oauth2/authorize`. Return `{ prompt: "login" }` to require a new sign-in even with a live session, or throw an `APIError` with an OAuth `error` to refuse the request. The client receives the error at its `redirect_uri` with `iss` and any `state` it sent. The provider issues no code and leaves the `request_uri` usable. Provider extensions can set the same hook. `issueAuthorizationCode()` runs it too, and returns a refusal to its caller directly. A policy result of `{ prompt: "login" }` fails there with `login_required`. This lets a deployment enforce `acr_values`, which the provider still treats as voluntary by default.
