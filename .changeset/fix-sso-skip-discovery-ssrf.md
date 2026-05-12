---
"@better-auth/sso": patch
---

fix(sso): validate user-supplied OIDC endpoint URLs at provider registration and update

When `skipDiscovery: true` was passed to `POST /sso/register`, or any
`oidcConfig` URL was passed to `POST /sso/update-provider`, the supplied
`authorizationEndpoint`, `tokenEndpoint`, `userInfoEndpoint`, `jwksEndpoint`,
and `discoveryEndpoint` values were persisted on the provider row without
origin validation, then fetched server-side at OIDC callback time. An
authenticated user could register or update an SSO provider with internal
URLs (RFC 1918, link-local, cloud-metadata FQDNs like `169.254.169.254`,
loopback) and use the callback handler to coerce the server into making
requests to those hosts.

Both endpoints now run user-supplied OIDC URLs through a layered gate:

1. URL parsing + `http(s)` scheme requirement
2. `isPublicRoutableHost` from `@better-auth/core/utils/host` (rejects
   loopback, RFC 1918, link-local, ULA, cloud-metadata FQDNs, multicast,
   broadcast, and reserved ranges per RFC 6890)
3. `trustedOrigins` allowlist as the documented escape hatch for customers
   running internal IdPs on private networks

A request that fails the gate is rejected with `BAD_REQUEST` and the new
`discovery_private_host` error code (or `discovery_invalid_url` for
malformed URLs / non-`http(s)` schemes).
