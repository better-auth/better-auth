---
"@better-auth/oauth-provider": patch
---

The `/oauth2/authorize` endpoint now forwards standard OIDC parameters (e.g. `login_hint`) and custom query parameters to the login/consent pages instead of dropping them. The endpoint's query schema validated against a fixed allow-list and stripped every other parameter before it could be signed, stored in the OAuth state, or forwarded — so `login_hint` and any custom params never reached a custom `loginPage`, and were also lost across the post-login continuation. The query schema now passes through unknown keys, restoring the documented behavior that "all parameters sent to the authorize endpoint (including any custom ones) are signed and verified."
