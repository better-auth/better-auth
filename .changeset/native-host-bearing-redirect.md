---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Accept host-bearing custom-scheme redirect URIs for native OAuth clients (for example Cursor's `cursor://` MCP callback). The RFC 8252 reverse-domain, authority-free form is still recommended; reserved schemes remain rejected.
