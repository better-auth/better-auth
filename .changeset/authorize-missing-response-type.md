---
"@better-auth/oauth-provider": patch
---

OAuth Provider authorization requests that omit `response_type` now return `invalid_request` to the verified client redirect URI instead of falling back to the provider error page.
