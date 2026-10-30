---
"@better-auth/oauth-provider": minor
---

Add `publicClientsSupported`, decoupling the advertised public-client support from how clients are registered. A provider with protected dynamic client registration (`allowUnauthenticatedClientRegistration: false`) previously advertised `token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"]` even though its token endpoint accepts public clients, so conformant clients concluded public clients were unsupported. Unset, the option keeps the current derived behavior.
