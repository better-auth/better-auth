---
"better-auth": minor
---

Generic OAuth now checks the discovery document's `issuer` before using it, as RFC 8414 §3.3 requires. When `discoveryUrl` is a well-known URL, the discovered issuer must be the one the URL is built from. Otherwise the provider is skipped and an error is logged.

If your provider publishes discovery under another name for the same issuer, such as a tenant domain instead of the tenant ID, set the new `issuer` option to the issuer identifier the provider documents. The discovered issuer must then equal it exactly.
