---
"@better-auth/core": patch
---

Harden the host classifier (`@better-auth/core/utils/host`) against three non-public address forms it previously reported as public: deprecated IPv4-compatible IPv6 (`::w.x.y.z`, RFC 4291 §2.5.5.1, e.g. `[::127.0.0.1]` which `URL` normalizes to `[::7f00:1]`), the 6to4 relay anycast prefix `192.88.99.0/24` (RFC 7526), and deprecated site-local `fec0::/10` (RFC 3879). SSRF gates built on `isPublicRoutableHost` / `classifyHost` (`jwks_uri` validation, SSO OIDC discovery, CIMD metadata fetches) now reject these.
