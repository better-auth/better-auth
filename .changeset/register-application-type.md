---
"@better-auth/oauth-provider": minor
---

Accept `application_type` (OIDC Registration §2, required of MCP clients by the MCP 2026-07-28 spec) in dynamic client registration. When provided, redirect URIs are constrained to the declared type: `native` clients may use custom schemes, loopback `http`, or `https`; `web` clients require `https` on non-loopback hosts. Omitting the parameter keeps prior behavior.
