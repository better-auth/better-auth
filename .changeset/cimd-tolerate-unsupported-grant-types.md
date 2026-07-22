---
"@better-auth/cimd": patch
---

fix(cimd): tolerate unsupported grant_types/response_types in metadata documents

Client ID Metadata Document validation rejected the entire client when its
`grant_types` or `response_types` contained any value the server does not
support. VS Code's published metadata document
(`https://vscode.dev/oauth/client-metadata.json`) declares
`urn:ietf:params:oauth:grant-type:device_code` alongside `authorization_code`
and `refresh_token`, so its MCP OAuth flow failed against any better-auth
server with:

```
{"error":"invalid_client","error_description":"grant_types must be a subset of [\"authorization_code\", \"refresh_token\"]"}
```

Per [RFC 7591 §2.1](https://datatracker.ietf.org/doc/html/rfc7591#section-2.1)
and the [CIMD draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/),
the authorization server should ignore grant/response types it does not support
rather than rejecting the client. Validation now only requires that
`authorization_code` (and `code` for `response_types`) is present, and the
unsupported entries are filtered out before the client is persisted, so they
never reach the database or grant any capability. The token endpoint already
gates `grant_type` independently, so this grants no new capabilities.
