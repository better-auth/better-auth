---
"@better-auth/oauth-provider": patch
---

Fix TypeScript error when using `oauthProvider()` with `exactOptionalPropertyTypes: true`. The `oauth2Authorize` endpoint's OpenAPI parameters array now carries an explicit `OpenAPIParameter[]` annotation, preventing TypeScript from synthesizing `format?: undefined` on scalar schemas and causing a TS2322 assignability failure.
