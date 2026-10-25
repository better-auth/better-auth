---
"@better-auth/oauth-provider": patch
---

Fix `/oauth2/revoke` returning 400 for unknown or already-revoked tokens. Per RFC 7009 it now answers 200, and `token_type_hint` only orders the lookup instead of restricting it, so a token sent with the wrong hint is still revoked.
