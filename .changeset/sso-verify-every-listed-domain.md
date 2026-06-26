---
"@better-auth/sso": patch
---

SSO domain verification now requires proof for every domain a provider lists. When a provider's `domain` has multiple comma-separated domains, each listed domain must publish the verification TXT record before the provider is marked verified. The verifier accepts TXT records that exactly match the raw verification token, matching the documented setup flow, or the existing `identifier=value` format.
