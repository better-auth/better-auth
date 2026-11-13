---
"@better-auth/oauth-provider": minor
---

`authorization_details_types_supported` in protected resource metadata is now typed as `string[]`, matching RFC 9728. The type previously accepted only a single string, so metadata built from it was not a valid JSON array. If you pass this field to `getProtectedResourceMetadata`, wrap the value in an array.
