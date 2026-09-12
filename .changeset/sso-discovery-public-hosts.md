---
"@better-auth/sso": patch
---

Allow OIDC discovery against publicly routable issuers without a `trustedOrigins` entry, so the DNS-resolution SSRF guard actually runs for them. The discovery URL and every endpoint taken from the discovery document now follow the same public-or-allowlisted host policy as manually configured endpoints. Non-public hosts still require a `trustedOrigins` entry and now fail with `discovery_private_host`; `discovery_untrusted_origin` is no longer emitted.
