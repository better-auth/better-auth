---
"better-auth": patch
---

Only infer the OAuth proxy current URL from `request.url` when its origin is allowlisted in `trustedOrigins` (wildcard patterns supported). The current URL determines the origin that production redirects the encrypted login profile to. An un-allowlisted request origin is now ignored and the plugin falls back to the vendor/base URL. Explicitly configured `currentURL` values are unaffected; make sure your preview/development origins are listed in `trustedOrigins`, or set `currentURL` directly.
