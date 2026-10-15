---
"@better-auth/oauth-provider": patch
---

Corrected the OpenAPI response schemas for `/oauth2/consent` and `/oauth2/continue` to describe `{ redirect: true, url: string }`, so generated clients no longer expect a nonexistent `redirect_uri` field. Runtime responses are unchanged.
