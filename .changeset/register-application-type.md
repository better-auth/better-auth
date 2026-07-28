---
"@better-auth/oauth-provider": minor
"@better-auth/cimd": minor
---

Client registration accepts `application_type` (OIDC Registration §2), which the MCP 2026-07-28 spec requires MCP clients to send. When provided, redirect URIs are constrained to what the declared type allows: `native` clients may use custom schemes, loopback `http`, or claimed `https` links; `web` clients require `https` on non-loopback hosts. Omitting the parameter leaves redirect URIs unconstrained.

The constraint applies to both registration paths: dynamic client registration and Client ID Metadata Documents, which the same spec revision makes the preferred mechanism. A registration that sends both `application_type` and `type` must keep them consistent, so a client record cannot claim two different profiles.
