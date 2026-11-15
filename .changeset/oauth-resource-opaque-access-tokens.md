---
"@better-auth/oauth-provider": minor
---

A protected resource can now receive opaque access tokens instead of JWTs, by setting `accessTokenFormat: "opaque"` on it, or on `resourceDefaults` for every resource that does not set its own. The token keeps the resource as its audience, so introspection reports it in `aud` and `verifyResourceRequest({ audience })` accepts it only for that resource. Resources without the setting keep receiving JWTs. A request for several resources whose formats differ fails with `invalid_target`.

This adds an `accessTokenFormat` column to `oauthResource`. Run `npx auth@latest migrate`, or generate and apply the schema, before deploying, because the schema check fails every request until the column exists.
