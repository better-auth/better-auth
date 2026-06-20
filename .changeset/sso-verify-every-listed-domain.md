---
"@better-auth/sso": patch
---

SSO domain verification now proves ownership of every domain a provider lists. When a provider's `domain` holds several comma-separated domains, each one must have its own verifying DNS TXT record before the provider is marked verified — matching the set of domains accepted at sign-in and used for provider and organization routing. Previously the value was reduced to a single host for the DNS check.
