---
"better-auth": minor
---

Add RFC 8707 resource indicator support to the device authorization plugin. Bind one or more allowed resources at `/device/code`, then omit `resource` at `/device/token` to use the full grant or request a subset. The token endpoint returns an RFC 9068 JWT access token restricted to the resolved audience, and `GET /device` exposes the bound client, scope, and resource to the authenticated user for approval. The existing opaque-token behavior remains unchanged when the device request omits `resource`.
