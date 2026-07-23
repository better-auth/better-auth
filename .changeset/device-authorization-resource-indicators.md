---
"better-auth": minor
---

Device authorization can now bind one or more RFC 8707 `resource` values at `/device/code` and issue an RFC 9068 JWT access token for the approved audience, or a requested subset, at `/device/token`. Enable this path with the JWT plugin and `allowedResources`; requests without `resource` continue returning opaque tokens. Authenticated approval pages can read the requested `client_id`, `scope`, and `resource` from `GET /device`, and `customAccessTokenClaims` can add non-reserved claims to issued JWTs. Re-run Better Auth schema migration or generation to add the nullable `deviceCode.resource` field.
