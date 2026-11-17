---
"@better-auth/oauth-provider": minor
---

ID tokens, JWT access tokens, introspection responses, and back-channel logout tokens now carry the same `iss` as the discovery `issuer`. Before, they carried `jwt.issuer` or the base URL as configured, so a trailing slash, an uppercase host, or a default port gave them an `iss` that clients checking against discovery rejected, and the end-session endpoint rejected the provider's own ID tokens as `id_token_hint`. The resource client's default `authorization_servers` entry is now the discovery issuer too. Better Auth's own checks accept both values, so tokens issued before the upgrade keep working until they expire. A verifier outside Better Auth that pins the configured value must switch to the discovery `issuer`, as the 1.8 upgrade guide describes.
