---
"@better-auth/oauth-provider": patch
---

Refresh tokens without `offline_access` now stop working once their session expires or is deleted. Since 1.7.26, a client could refresh such a token after the session ended, including a refresh that read the token just before sign-out, and receive an access token that introspection and UserInfo still accepted. The `refresh_token` grant now fails with `invalid_grant` for these tokens, and introspection reports them inactive. A refresh of an `offline_access` token that would drop `offline_access` after the session ended, because the client narrowed the scope or a resource's allowed scopes exclude it, also fails, instead of replacing the token with one that no longer works. Tokens from the device authorization grant have no session and are not affected. Refresh tokens with `offline_access` are unchanged: they keep working after the session ends, and the tokens they issue leave out `sid`.
