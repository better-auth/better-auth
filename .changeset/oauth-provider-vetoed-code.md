---
"@better-auth/oauth-provider": patch
---

The authorization endpoint no longer redirects with an authorization code when a `verification.create.before` database hook returns `false` for the code record. It now redirects to the client with `error=server_error`, as RFC 6749 §4.1.2.1 defines, instead of a code that the token endpoint would reject.
