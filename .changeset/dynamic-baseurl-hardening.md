---
"better-auth": patch
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

Dynamic `baseURL` configurations now resolve consistently for direct server API calls and OAuth or MCP discovery:

- Fail with a clear `APIError` when no base URL can be resolved or the request host violates `allowedHosts`.
- Apply `advanced.trustedProxyHeaders` before trusting forwarded host and protocol values, and refresh request-dependent trusted origins, trusted providers, and cookies for each direct call.
- Infer HTTP for loopback development hosts when only headers are available, while rejecting request-like objects without usable URL and header data.
- Generate OAuth issuer, discovery, protected-resource, and JWKS URLs from the current request host.
- Make `requireMcpAuth` use the resolved Better Auth URL for its default issuer, resource, and JWKS URL. Resource servers with fully dynamic hosts can use `mcpHandler` with explicit verification options.
- Preserve metadata response headers supplied as `Headers`, tuple arrays, or records.
