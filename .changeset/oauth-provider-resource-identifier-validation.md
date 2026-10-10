---
"@better-auth/oauth-provider": patch
---

Resource identifiers created with `adminCreateOAuthResource` or listed in the `resources` option now follow the same rules as the `resource` parameter in token and registration requests. An identifier with an empty fragment (`https://api.example.com/#`) or a `javascript:`, `data:`, or `vbscript:` scheme is rejected, and startup seeding skips it with a warning. Token requests already rejected these identifiers, so no working resource is affected. Setups with a custom `identifierValidator` are unaffected.
