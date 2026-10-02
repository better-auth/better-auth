---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
---

Accept host-bearing custom-scheme redirect URIs for native OAuth clients and CIMD documents (for example Cursor's `cursor://` MCP callback). The RFC 8252 reverse-domain, authority-free form is still recommended; reserved schemes remain rejected. Adds `clientRegistrationDefaultApplicationType` (`"web"` | `"native"` | `"infer"`) so operators can classify dynamic registrations that omit `application_type` — as current Cursor builds do — as native when every redirect URI is a non-http(s) scheme; a sent `application_type` is never overridden and the strict `"web"` default is unchanged.
