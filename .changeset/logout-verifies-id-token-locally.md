---
"@better-auth/oauth-provider": patch
---

RP-initiated logout now verifies `id_token_hint` with the key set the provider already holds, instead of requesting its own public JWKS endpoint over HTTP. `/oauth2/end-session` no longer fails when the auth server cannot reach its own base URL, such as behind an edge that requires a header or an IP allowlist.
