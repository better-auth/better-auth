---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): override confidential auth methods to public in unauthenticated DCR

When `allowUnauthenticatedClientRegistration` is enabled, unauthenticated DCR
requests that specify `client_secret_post`, `client_secret_basic`, or omit
`token_endpoint_auth_method` (which defaults to `client_secret_basic` per
[RFC 7591 §2](https://datatracker.ietf.org/doc/html/rfc7591#section-2)) are
now silently overridden to `token_endpoint_auth_method: "none"` (public client)
instead of being rejected with HTTP 401.

This follows [RFC 7591 §3.2.1](https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.1),
which allows the server to "reject or replace any of the client's requested
metadata values submitted during the registration and substitute them with
suitable values." The registration response communicates the actual method
back to the client, allowing compliant clients to adjust.

This fixes interoperability with real-world MCP clients (Claude, Codex, Factory
Droid, and others) that send `token_endpoint_auth_method: "client_secret_post"`
in their DCR payload because the server metadata advertises it in
`token_endpoint_auth_methods_supported`.

Closes #8588
