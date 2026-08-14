---
"@better-auth/oauth-provider": patch
---

`private_key_jwt` client assertions can use either the receiving endpoint URL or the OpenID Provider issuer as `aud`. The claim may be a string or an array containing at least one accepted value. This rule applies to token, introspection, and revocation requests.
