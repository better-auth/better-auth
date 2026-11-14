---
"better-auth": minor
---

Generic OAuth now checks the discovery document's `issuer` before using it, as RFC 8414 §3.3 requires. Without the new `issuer` option, `discoveryUrl` must be a well-known URL and the discovered issuer must be the one the URL is built from. Otherwise the provider is skipped and an error is logged.

If your provider publishes discovery at another path, or under another name for the same issuer such as a tenant domain instead of the tenant ID, set `issuer` to the issuer identifier the provider documents. The discovered issuer must then equal it exactly.
