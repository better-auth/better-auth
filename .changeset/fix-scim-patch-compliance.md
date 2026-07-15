---
"@better-auth/scim": minor
---

**BREAKING (partial):** `PATCH /scim/v2/Users/:id` now rejects `remove` operations with `400 noTarget` (RFC 7644 §3.5.2.2) instead of silently ignoring them and returning `204` as if they had succeeded. A path-less `remove` returns `noTarget` per spec; a `remove` with a path returns `400` since attribute removal isn't currently implemented for any path.

Also (non-breaking): `PATCH /scim/v2/Users/:id` now returns `200 OK` with the updated resource body when the `attributes` query parameter is specified, per RFC 7644 §3.5.2, instead of always returning `204 No Content`.
