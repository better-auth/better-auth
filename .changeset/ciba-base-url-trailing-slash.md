---
"@better-auth/ciba": patch
---

When `baseURL` ends in `/`, the approval link sent to the user and the advertised `backchannel_authentication_endpoint` no longer contain a double slash.
