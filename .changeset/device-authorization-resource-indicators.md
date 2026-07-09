---
"better-auth": minor
---

Add RFC 8707 resource indicator support to the device authorization plugin. Passing a `resource` to `/device/code` and/or `/device/token` now returns an RFC 9068 JWT access token audience-restricted to that resource, validated against a new `allowedResources` option, with an optional `customAccessTokenClaims` hook. Without a `resource`, behavior is unchanged (opaque token).
