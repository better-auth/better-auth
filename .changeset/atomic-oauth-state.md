---
"better-auth": patch
---

Reject concurrent OAuth callbacks that reuse the same database-backed state. This also protects database-backed SAML relay state.
