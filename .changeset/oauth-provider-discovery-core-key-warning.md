---
"@better-auth/oauth-provider": patch
---

Discovery now logs a warning when an OAuth provider extension or client discovery contributes a metadata key the provider already sets, such as `issuer`. The provider's value is still kept. Previously the contribution was dropped silently.
