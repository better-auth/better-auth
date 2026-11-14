---
"@better-auth/oauth-provider": patch
---

Discovery now logs a warning when it ignores a metadata contribution: an OAuth provider extension or client discovery that sets a key the provider already sets, such as `issuer`, or an extension that sets a key a client discovery already sets. The published values are unchanged. Previously these contributions were dropped silently.
