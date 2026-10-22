---
"@better-auth/oauth-provider": minor
---

`postLogin.consentReferenceId` and the `shouldRedirect` hooks of `signup`, `selectAccount`, and `postLogin` now receive `query`, the authorization request the provider validated. It includes parameters the client adds, such as `organization`, and every requested `resource`. A client can name the organization a consent is for, and your hooks can act on the resources a request targets, without your code reading `getOAuthProviderState()`.

Your consent page can also send the organization the user chose as `reference_id` to `/oauth2/consent`. `consentReferenceId` receives it as `consent.referenceId`, which is set only while the acceptance is recorded, and decides whether to accept it. The consent endpoint rejects `reference_id` with `invalid_request` when `postLogin` is not configured. When a user accepts, the authorization code now carries the reference stored with the consent, and `consentReferenceId` runs once per acceptance instead of twice.
