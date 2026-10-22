---
"@better-auth/oauth-provider": minor
---

`postLogin.consentReferenceId` and the `shouldRedirect` hooks of `signup`, `selectAccount`, and `postLogin` now receive `query`, the validated authorization request. Hooks can read parameters the client adds, such as the `organization` a consent is for, and every requested `resource`.

Your consent page can send the organization the user picked as `reference_id` to `/oauth2/consent`, and `consentReferenceId` receives it as `consent.referenceId` to verify. Accepting with `reference_id` fails with `invalid_request` when `postLogin.consentReferenceId` is not configured; a denial ignores it. `consentReferenceId` now runs once per acceptance instead of twice.
