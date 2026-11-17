---
"@better-auth/passkey": minor
---

The passkey plugin now uses SimpleWebAuthn 14, which requires Node.js 22 or newer (Deno 2.4 or newer) and, on runtimes that support ML-DSA, offers ML-DSA-44 as the preferred algorithm when registering a passkey. The SimpleWebAuthn types re-exported from `@better-auth/passkey/client` follow version 14: `AuthenticatorTransportFuture` is gone, so import `AuthenticatorTransport` or use `string[]` for credential transports.
