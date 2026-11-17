---
"@better-auth/ciba": minor
---

Removed the `allowPublicClients` option. CIBA requires client authentication at the backchannel and token endpoints (CIBA §7.1), so clients registered with `token_endpoint_auth_method: "none"` are now always rejected with `invalid_client`. If you set `allowPublicClients` during the beta, remove it and register those clients with a secret or with `private_key_jwt`.
