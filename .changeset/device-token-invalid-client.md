---
"better-auth": patch
---

`/device/token` now returns `invalid_client` instead of `invalid_grant` when `validateClient` rejects the `client_id`, matching `/device/code` and RFC 6749 section 5.2.
