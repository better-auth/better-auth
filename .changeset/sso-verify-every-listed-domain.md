---
"@better-auth/sso": patch
---

SSO domain verification now requires proof for every domain a provider lists. When a provider's `domain` has multiple comma-separated domains, each listed domain must publish the verification TXT record before the provider is marked verified. The verifier also accepts TXT records containing the raw verification token, matching the documented setup flow.
