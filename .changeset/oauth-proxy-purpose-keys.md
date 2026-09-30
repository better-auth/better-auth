---
"better-auth": patch
---

Isolate OAuth state cookies and each OAuth Proxy payload with purpose-specific encryption keys. The `oAuthProxy` options and supported configuration remain unchanged.

Upgrade all Better Auth nodes that handle the same cookie-backed OAuth or SAML relay-state flow together. Upgrade every OAuth Proxy participant, including production and preview or development deployments, in the same cutover. OAuth sign-in, account-linking, and cookie-backed SAML sign-in flows started before the upgrade must be restarted. Mixed old and new participants cannot exchange existing state or proxy payloads, and there is no fallback to the previous shared key.
