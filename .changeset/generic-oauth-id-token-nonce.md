---
"better-auth": patch
"@better-auth/core": patch
---

Generic OAuth providers configured with OIDC discovery now include a server-generated `nonce` in OAuth sign-in and account-linking redirects. Providers that require OIDC nonce support can complete those flows without custom authorization parameters, and Better Auth rejects callbacks whose ID token does not include the expected nonce.

`nonce` is now framework-managed for OAuth authorization URLs. Requests that include `additionalParams.nonce` are rejected, and configured or helper-level `nonce` authorization params are ignored so callers cannot replace the value Better Auth generated for the flow.
